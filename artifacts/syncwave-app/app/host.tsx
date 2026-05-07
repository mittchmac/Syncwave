import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSync } from "@/context/SyncContext";
import { useSpotify } from "@/context/SpotifyContext";
import { getTopUSStations, searchStations, RadioStation, FEATURED_GENRES } from "@/lib/radioBrowser";
import { getCurrentPlayback } from "@/lib/spotifyApi";

const GPS_BROADCAST_MS = 8000;

const SYNC_LEAD_MS = 800;
const POLL_MS = 1000;

type HostStep = "mode" | "radio-pick" | "spotify-setup" | "active";

export default function HostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { phase, roomCode, roomMode, listenerCount, createRoom, leaveRoom, sendSpotifyPlay, sendSpotifyPause, sendRadioPlay, sendRadioStop, broadcastGps, sendMessage } = useSync();
  const { spotifyToken, isAuthing, authError, redirectUri, login } = useSpotify();

  const [step, setStep] = useState<HostStep>("mode");
  const [stationSearch, setStationSearch] = useState("");
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [copied, setCopied] = useState(false);
  const [nowPlayingName, setNowPlayingName] = useState<string | null>(null);
  const [nowPlayingArtist, setNowPlayingArtist] = useState<string | null>(null);
  const [showRedirectHelp, setShowRedirectHelp] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackUriRef = useRef<string | null>(null);
  const radioStreamStartedAtRef = useRef<number | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const qrValue = roomCode ?? "";
  const webLink = roomCode && domain ? `https://${domain}/?room=${roomCode}` : "";

  useEffect(() => {
    if (phase === "hosting" && step !== "active") setStep("active");
  }, [phase, step]);

  useEffect(() => {
    if (!loadingStations || stationSearch.trim()) return;
    getTopUSStations().then(setStations).finally(() => setLoadingStations(false));
  }, [loadingStations, stationSearch]);

  const loadFeatured = useCallback(() => {
    setLoadingStations(true);
    getTopUSStations().then((s) => { setStations(s); setLoadingStations(false); });
  }, []);

  const onSearchChange = useCallback((q: string) => {
    setStationSearch(q);
    if (!q.trim()) { loadFeatured(); return; }
    const timer = setTimeout(async () => {
      setLoadingStations(true);
      const res = await searchStations(q);
      setStations(res);
      setLoadingStations(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [loadFeatured]);

  const startRadioPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (selectedStation) {
        sendRadioPlay(selectedStation.url_resolved, selectedStation.name, selectedStation.favicon);
        const streamAgeMs = radioStreamStartedAtRef.current
          ? Date.now() - radioStreamStartedAtRef.current
          : 0;
        sendMessage({ type: "sync-ping", sentAt: Date.now(), streamAgeMs });
      }
    }, 10_000);
  }, [selectedStation, sendRadioPlay, sendMessage]);

  const startSpotifyPoll = useCallback(() => {
    if (!spotifyToken) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const state = await getCurrentPlayback(spotifyToken);
      if (!state?.item || !state.is_playing) {
        if (state && !state.is_playing) sendSpotifyPause();
        return;
      }
      const { item, progress_ms } = state;
      setNowPlayingName(item.name);
      setNowPlayingArtist(item.artists?.[0]?.name ?? "");
      sendSpotifyPlay({
        trackUri: item.uri,
        trackName: item.name,
        artistName: item.artists?.[0]?.name ?? "",
        albumArt: item.album?.images?.[0]?.url ?? "",
        positionMs: progress_ms,
        startAt: Date.now() + SYNC_LEAD_MS,
      });
      lastTrackUriRef.current = item.uri;
    }, POLL_MS);
  }, [spotifyToken, sendSpotifyPlay, sendSpotifyPause]);

  useEffect(() => {
    if (step === "active" && roomMode === "radio" && selectedStation) startRadioPoll();
    if (step === "active" && roomMode === "spotify" && spotifyToken) startSpotifyPoll();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, roomMode, selectedStation, spotifyToken, startRadioPoll, startSpotifyPoll]);

  // GPS broadcasting for radio mode
  useEffect(() => {
    if (step !== "active" || roomMode !== "radio") return;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;

      const broadcastNow = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!cancelled) broadcastGps(loc.coords.latitude, loc.coords.longitude);
        } catch {}
      };

      broadcastNow();
      gpsRef.current = setInterval(broadcastNow, GPS_BROADCAST_MS);
    })();

    return () => {
      cancelled = true;
      if (gpsRef.current) { clearInterval(gpsRef.current); gpsRef.current = null; }
    };
  }, [step, roomMode, broadcastGps]);

  const onPickRadio = useCallback(() => {
    setStep("radio-pick");
    loadFeatured();
  }, [loadFeatured]);

  const onPickSpotify = useCallback(() => {
    setStep("spotify-setup");
  }, []);

  const onSelectStation = useCallback((station: RadioStation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedStation(station);
    setNowPlayingName(station.name);
    radioStreamStartedAtRef.current = Date.now();
    createRoom("radio");
    sendRadioPlay(station.url_resolved, station.name, station.favicon);
  }, [createRoom, sendRadioPlay]);

  const onSpotifyReady = useCallback(async () => {
    if (!spotifyToken) { await login(); return; }
    createRoom("spotify");
    startSpotifyPoll();
  }, [spotifyToken, login, createRoom, startSpotifyPoll]);

  const onCopyCode = useCallback(async () => {
    if (!roomCode) return;
    await Clipboard.setStringAsync(roomCode);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  const onStop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (roomMode === "radio") sendRadioStop();
    leaveRoom();
    router.back();
  }, [pollRef, roomMode, sendRadioStop, leaveRoom]);

  if (step === "active" && phase === "hosting") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={["#0a2040", colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
        />
        <ScrollView
          contentContainerStyle={[styles.activeContainer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}
        >
          <View style={styles.activeHeader}>
            <Pressable onPress={onStop} style={styles.backBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
            <View style={styles.listenerBadge}>
              <Ionicons name="people" size={14} color={colors.primary} />
              <Text style={[styles.listenerText, { color: colors.primary }]}>{listenerCount}</Text>
            </View>
          </View>

          <Text style={[styles.activeLabel, { color: colors.mutedForeground }]}>Room Code</Text>
          <Pressable onPress={onCopyCode} style={[styles.codeBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.codeText, { color: colors.foreground }]}>{roomCode}</Text>
            <Feather name={copied ? "check" : "copy"} size={18} color={copied ? colors.primary : colors.mutedForeground} />
          </Pressable>

          {qrValue ? (
            <View style={[styles.qrBox, { backgroundColor: "#ffffff", borderRadius: colors.radius }]}>
              <QRCode value={qrValue} size={160} backgroundColor="white" color="#060e18" />
            </View>
          ) : null}

          <Text style={[styles.qrHint, { color: colors.mutedForeground }]}>
            Scan with SyncWave app to join instantly
          </Text>

          {webLink ? (
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(webLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={[styles.webLinkBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <Feather name="link" size={13} color={colors.mutedForeground} />
              <Text style={[styles.webLinkText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {webLink}
              </Text>
              <Feather name={copied ? "check" : "copy"} size={13} color={copied ? colors.primary : colors.mutedForeground} />
            </Pressable>
          ) : null}

          {nowPlayingName ? (
            <View style={[styles.nowPlayingCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.nowPlayingIcon, { backgroundColor: colors.primary + "22" }]}>
                {roomMode === "radio"
                  ? <Ionicons name="radio" size={22} color={colors.primary} />
                  : <MaterialCommunityIcons name="spotify" size={22} color="#1DB954" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nowPlayingTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {nowPlayingName}
                </Text>
                {nowPlayingArtist ? (
                  <Text style={[styles.nowPlayingArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {nowPlayingArtist}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.liveTag, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.liveText, { color: colors.primary }]}>LIVE</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.nowPlayingCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.nowPlayingArtist, { color: colors.mutedForeground }]}>
                {roomMode === "spotify" ? "Waiting for Spotify playback…" : "Broadcasting…"}
              </Text>
            </View>
          )}

          <Pressable
            onPress={onStop}
            style={({ pressed }) => [styles.stopBtn, { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="stop-circle" size={18} color="#fff" />
            <Text style={styles.stopBtnText}>End Room</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (step === "radio-pick") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.pickerHeader, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setStep("mode")} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Pick a Station</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginVertical: 12 }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={stationSearch}
            onChangeText={onSearchChange}
            placeholder="Search stations…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCorrect={false}
          />
        </View>
        {loadingStations ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={stations}
            keyExtractor={(s) => s.stationuuid}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 16 }}
            scrollEnabled={stations.length > 0}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelectStation(item)}
                style={({ pressed }) => [styles.stationRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={[styles.stationIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Ionicons name="radio-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stationName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.stationMeta, { color: colors.mutedForeground }]}>
                    {item.bitrate > 0 ? `${item.bitrate} kbps` : ""}
                    {item.countrycode ? ` · ${item.countrycode}` : ""}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No stations found</Text>
            }
          />
        )}
      </View>
    );
  }

  if (step === "spotify-setup") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={["#0a2040", colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
        />
        <ScrollView contentContainerStyle={[styles.setupContainer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
          <Pressable onPress={() => setStep("mode")} style={[styles.backBtn, { alignSelf: "flex-start" }]}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>

          <View style={[styles.spotifyLogo, { backgroundColor: "#1DB954" + "22" }]}>
            <MaterialCommunityIcons name="spotify" size={40} color="#1DB954" />
          </View>
          <Text style={[styles.setupTitle, { color: colors.foreground }]}>Spotify Host</Text>
          <Text style={[styles.setupSub, { color: colors.mutedForeground }]}>
            Whatever you play on Spotify will be shared with your room in real time.
            Requires Spotify Premium.
          </Text>

          {!spotifyToken ? (
            <>
              <Pressable
                onPress={() => setShowRedirectHelp((v) => !v)}
                style={[styles.helpRow, { borderColor: colors.border }]}
              >
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                  First time? You need to register a redirect URI
                </Text>
                <Feather name={showRedirectHelp ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
              </Pressable>

              {showRedirectHelp && (
                <View style={[styles.helpBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                  <Text style={[styles.helpBoxText, { color: colors.mutedForeground }]}>
                    Add this URI in your Spotify Developer Dashboard → App Settings → Redirect URIs:
                  </Text>
                  <Pressable
                    onPress={() => Clipboard.setStringAsync(redirectUri)}
                    style={[styles.uriBox, { backgroundColor: colors.muted, borderRadius: 8 }]}
                  >
                    <Text style={[styles.uriText, { color: colors.primary }]} selectable>
                      {redirectUri}
                    </Text>
                    <Feather name="copy" size={13} color={colors.primary} />
                  </Pressable>
                  <Text style={[styles.helpBoxText, { color: colors.mutedForeground, marginTop: 8 }]}>
                    After saving, tap Connect below.
                  </Text>
                </View>
              )}

              {authError ? (
                <Text style={[styles.errorText, { color: colors.destructive }]}>{authError}</Text>
              ) : null}

              <Pressable
                onPress={() => login()}
                disabled={isAuthing}
                style={({ pressed }) => [styles.connectBtn, { backgroundColor: "#1DB954", opacity: pressed || isAuthing ? 0.8 : 1 }]}
              >
                {isAuthing
                  ? <ActivityIndicator color="#000" size="small" />
                  : <><MaterialCommunityIcons name="spotify" size={20} color="#000" /><Text style={styles.connectBtnText}>Connect Spotify</Text></>}
              </Pressable>
            </>
          ) : (
            <>
              <View style={[styles.connectedRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={[styles.connectedText, { color: colors.foreground }]}>Spotify connected</Text>
              </View>
              <Pressable
                onPress={onSpotifyReady}
                style={({ pressed }) => [styles.connectBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.connectBtnText, { color: colors.primaryForeground }]}>Start Broadcasting</Text>
                <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0a2040", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      <View style={[styles.modeContainer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { alignSelf: "flex-start", marginHorizontal: 24 }]}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.modeTitle, { color: colors.foreground }]}>Create a Room</Text>
        <Text style={[styles.modeSub, { color: colors.mutedForeground }]}>Choose what you want to share</Text>

        <View style={{ paddingHorizontal: 24, gap: 14, marginTop: 32 }}>
          <Pressable
            onPress={onPickRadio}
            style={({ pressed }) => [styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1, borderRadius: colors.radius }]}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons name="radio-outline" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modeCardTitle, { color: colors.foreground }]}>Radio Station</Text>
              <Text style={[styles.modeCardSub, { color: colors.mutedForeground }]}>
                Live streams · works in background
              </Text>
            </View>
            <View style={[styles.recBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.recText, { color: colors.primaryForeground }]}>Best</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={onPickSpotify}
            style={({ pressed }) => [styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1, borderRadius: colors.radius }]}
          >
            <View style={[styles.modeIcon, { backgroundColor: "#1DB954" + "22" }]}>
              <MaterialCommunityIcons name="spotify" size={28} color="#1DB954" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modeCardTitle, { color: colors.foreground }]}>Spotify</Text>
              <Text style={[styles.modeCardSub, { color: colors.mutedForeground }]}>
                Share your playback · Premium required
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modeContainer: { flex: 1 },
  modeTitle: { fontSize: 28, fontFamily: "Inter_700Bold", paddingHorizontal: 24, marginTop: 16 },
  modeSub: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 24, marginTop: 6 },
  modeCard: { flexDirection: "row", alignItems: "center", padding: 18, borderWidth: 1, gap: 14 },
  modeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  modeCardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modeCardSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  recBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  recText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  activeContainer: { paddingHorizontal: 24, gap: 14, alignItems: "center" },
  activeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" },
  listenerBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  listenerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  activeLabel: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
  codeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, borderWidth: 1, width: "100%" },
  codeText: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: 6 },
  qrBox: { padding: 16, alignItems: "center", justifyContent: "center", marginVertical: 4 },
  qrHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  webLinkBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1 },
  webLinkText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular" },
  nowPlayingCard: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1, gap: 12, width: "100%" },
  nowPlayingIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  nowPlayingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nowPlayingArtist: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  liveTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  liveText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  stopBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 28, marginTop: 8 },
  stopBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  stationRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1 },
  stationIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  stationName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  stationMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: "Inter_400Regular" },
  setupContainer: { paddingHorizontal: 24, gap: 16 },
  spotifyLogo: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 16 },
  setupTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  setupSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  helpRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  helpText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  helpBox: { padding: 14, gap: 8, borderWidth: 1 },
  helpBoxText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  uriBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, gap: 8 },
  uriText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  connectBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderWidth: 1 },
  connectedText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
