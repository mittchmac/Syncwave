import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSync } from "@/context/SyncContext";
import { useSpotify } from "@/context/SpotifyContext";
import { useAudio } from "@/context/AudioContext";
import { getCurrentPlayback, playTrack, seekTo } from "@/lib/spotifyApi";
import { useGpsAudioSync } from "@/hooks/useGpsAudioSync";

const DRIFT_CHECK_MS = 6000;
const DRIFT_THRESHOLD_MS = 2000;

export default function JoinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { phase, roomCode, roomMode, hostDisconnected, lastRadioPlay, lastSpotifyPlay, joinRoom, leaveRoom, requestSync } = useSync();
  const { spotifyToken, isAuthing, authError, redirectUri, login } = useSpotify();
  const { isPlaying, playStream, stopStream } = useAudio();

  const [codeInput, setCodeInput] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRedirectHelp, setShowRedirectHelp] = useState(false);

  const driftRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const gpsSync = useGpsAudioSync(phase === "joined" && roomMode === "radio");

  useEffect(() => {
    if (phase === "joined") {
      setJoining(false);
      setJoinError(null);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    }
  }, [phase]);

  const soundOffsetRef = useRef(0);
  useEffect(() => {
    soundOffsetRef.current = gpsSync.soundOffsetMs ?? 0;
  }, [gpsSync.soundOffsetMs]);

  useEffect(() => {
    if (phase !== "joined" || roomMode !== "radio") return;
    if (lastRadioPlay) {
      const delayMs = soundOffsetRef.current;
      if (delayMs > 0) {
        const t = setTimeout(() => {
          playStream(lastRadioPlay.streamUrl, lastRadioPlay.stationName).catch(() => {});
        }, delayMs);
        return () => clearTimeout(t);
      }
      playStream(lastRadioPlay.streamUrl, lastRadioPlay.stationName).catch(() => {});
    } else {
      stopStream();
    }
  }, [lastRadioPlay, phase, roomMode, playStream, stopStream]);

  useEffect(() => {
    if (phase !== "joined" || roomMode !== "spotify" || !spotifyToken || !lastSpotifyPlay) return;

    const sync = async () => {
      const { trackUri, positionMs, startAt } = lastSpotifyPlay;
      const nowMs = positionMs + Math.max(0, Date.now() - startAt);
      const success = await playTrack(spotifyToken, trackUri, nowMs);
      if (!success) setSpotifyError("Could not control Spotify. Make sure Spotify is open and active on your device.");
      else setSpotifyError(null);
    };
    sync();
  }, [lastSpotifyPlay, phase, roomMode, spotifyToken]);

  useEffect(() => {
    if (phase !== "joined" || roomMode !== "spotify" || !spotifyToken) return;
    driftRef.current = setInterval(async () => {
      if (!lastSpotifyPlay) return;
      const state = await getCurrentPlayback(spotifyToken);
      if (!state?.is_playing || !state.item) return;
      if (state.item.uri !== lastSpotifyPlay.trackUri) return;
      const expectedMs = lastSpotifyPlay.positionMs + (Date.now() - lastSpotifyPlay.startAt);
      const drift = Math.abs((state.progress_ms ?? 0) - expectedMs);
      if (drift > DRIFT_THRESHOLD_MS) {
        await seekTo(spotifyToken, expectedMs);
      }
    }, DRIFT_CHECK_MS);
    return () => { if (driftRef.current) clearInterval(driftRef.current); };
  }, [phase, roomMode, spotifyToken, lastSpotifyPlay]);

  const onLeave = useCallback(() => {
    if (driftRef.current) clearInterval(driftRef.current);
    stopStream();
    leaveRoom();
    router.back();
  }, [stopStream, leaveRoom]);

  const onJoin = useCallback(() => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 4) { Alert.alert("Enter a 4-letter room code"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoining(true);
    setJoinError(null);
    joinRoom(code);

    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = setTimeout(() => {
      setJoining(false);
      setJoinError("Could not connect to the room. Check the code and try again.");
    }, 10_000);
  }, [codeInput, joinRoom]);

  const onScanPress = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("QR Scanning", "QR code scanning requires the native app on your phone. Enter the code manually above.");
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) return;
    }
    setShowScanner(true);
    setScanned(false);
  }, [cameraPermission, requestCameraPermission]);

  const onBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setShowScanner(false);
    const code = data.trim().toUpperCase();
    const match = code.match(/ROOM=([A-Z0-9]{4})/i) ?? code.match(/^([A-Z0-9]{4})$/);
    const roomCodeScanned = match?.[1]?.toUpperCase();
    if (roomCodeScanned) {
      setCodeInput(roomCodeScanned);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [scanned]);

  if (showScanner) {
    return (
      <View style={[styles.root, { backgroundColor: "#000" }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View style={[styles.scanOverlay, { paddingTop: topPad + 16 }]}>
          <Pressable onPress={() => setShowScanner(false)} style={styles.scanBack}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>Aim at the room QR code</Text>
        </View>
      </View>
    );
  }

  if (phase === "joined") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={["#0a2040", colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
        />
        <ScrollView contentContainerStyle={[styles.activeContainer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
          <View style={styles.activeHeader}>
            <Pressable onPress={onLeave} style={styles.backBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
            <View style={styles.roomBadge}>
              <Text style={[styles.roomBadgeText, { color: colors.mutedForeground }]}>Room </Text>
              <Text style={[styles.roomBadgeCode, { color: colors.foreground }]}>{roomCode}</Text>
            </View>
            {hostDisconnected ? (
              <View style={[styles.warnTag, { backgroundColor: "#f59e0b22" }]}>
                <Feather name="wifi-off" size={12} color="#f59e0b" />
              </View>
            ) : <View style={{ width: 36 }} />}
          </View>

          {roomMode === "radio" ? (
            <View style={{ alignItems: "center", gap: 16, marginTop: 24 }}>
              <View style={[styles.bigIcon, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="radio" size={40} color={colors.primary} />
              </View>
              {lastRadioPlay ? (
                <>
                  <Text style={[styles.trackName, { color: colors.foreground }]}>{lastRadioPlay.stationName}</Text>
                  <Text style={[styles.trackArtist, { color: colors.mutedForeground }]}>Live Radio</Text>
                  <View style={[styles.syncRow, { backgroundColor: colors.card, borderRadius: 20 }]}>
                    <View style={[styles.syncDot, { backgroundColor: isPlaying ? colors.primary : colors.mutedForeground }]} />
                    <Text style={[styles.syncText, { color: isPlaying ? colors.primary : colors.mutedForeground }]}>
                      {isPlaying
                        ? gpsSync.rateAdjust !== 1.0
                          ? `Syncing… (${gpsSync.rateAdjust > 1 ? "+" : ""}${((gpsSync.rateAdjust - 1) * 100).toFixed(0)}%)`
                          : "Synced"
                        : "Connecting…"}
                    </Text>
                  </View>
                  {gpsSync.distanceM !== null && gpsSync.soundOffsetMs !== null ? (
                    <View style={[styles.gpsBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Feather name="map-pin" size={12} color={colors.primary} />
                      <Text style={[styles.gpsBadgeText, { color: colors.mutedForeground }]}>
                        {gpsSync.distanceM < 1000
                          ? `${Math.round(gpsSync.distanceM)}m away`
                          : `${(gpsSync.distanceM / 1000).toFixed(1)}km away`}
                        {gpsSync.soundOffsetMs > 0 ? ` · ${gpsSync.soundOffsetMs}ms offset` : " · no offset needed"}
                      </Text>
                    </View>
                  ) : gpsSync.gpsStatus === "acquiring" ? (
                    <View style={[styles.gpsBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                      <Text style={[styles.gpsBadgeText, { color: colors.mutedForeground }]}>Acquiring GPS…</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.bgNote, { color: colors.mutedForeground }]}>
                    Audio continues when you switch apps
                  </Text>
                </>
              ) : (
                <Text style={[styles.trackArtist, { color: colors.mutedForeground }]}>
                  {hostDisconnected ? "Host disconnected" : "Waiting for host…"}
                </Text>
              )}
            </View>
          ) : (
            <View style={{ alignItems: "center", gap: 16, marginTop: 24 }}>
              {lastSpotifyPlay ? (
                <>
                  <View style={[styles.bigIcon, { backgroundColor: "#1DB954" + "22" }]}>
                    <MaterialCommunityIcons name="spotify" size={40} color="#1DB954" />
                  </View>
                  <Text style={[styles.trackName, { color: colors.foreground }]} numberOfLines={2}>
                    {lastSpotifyPlay.trackName}
                  </Text>
                  <Text style={[styles.trackArtist, { color: colors.mutedForeground }]}>
                    {lastSpotifyPlay.artistName}
                  </Text>
                </>
              ) : (
                <ActivityIndicator color={colors.primary} size="large" />
              )}

              {!spotifyToken ? (
                <View style={{ width: "100%", gap: 12 }}>
                  <Text style={[styles.trackArtist, { color: colors.mutedForeground, textAlign: "center" }]}>
                    Connect Spotify to sync playback
                  </Text>

                  <Pressable
                    onPress={() => setShowRedirectHelp((v) => !v)}
                    style={[styles.helpRow, { borderColor: colors.border }]}
                  >
                    <Feather name="info" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
                      First time? Register redirect URI
                    </Text>
                    <Feather name={showRedirectHelp ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                  </Pressable>

                  {showRedirectHelp && (
                    <View style={[styles.helpBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                      <Text style={[styles.helpBoxText, { color: colors.mutedForeground }]}>
                        Add to Spotify Developer Dashboard → Redirect URIs:
                      </Text>
                      <View style={[styles.uriBox, { backgroundColor: colors.muted, borderRadius: 8 }]}>
                        <Text style={[styles.uriText, { color: colors.primary }]} selectable>{redirectUri}</Text>
                      </View>
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
                </View>
              ) : (
                <View style={{ width: "100%", gap: 10 }}>
                  {spotifyError ? (
                    <Text style={[styles.errorText, { color: "#f59e0b", textAlign: "center" }]}>{spotifyError}</Text>
                  ) : (
                    <View style={[styles.syncRow, { backgroundColor: colors.card, borderRadius: 20, alignSelf: "center" }]}>
                      <View style={[styles.syncDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.syncText, { color: colors.primary }]}>Synced</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          <Pressable
            onPress={onLeave}
            style={({ pressed }) => [styles.leaveBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginTop: 32 }]}
          >
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
            <Text style={[styles.leaveBtnText, { color: colors.mutedForeground }]}>Leave Room</Text>
          </Pressable>
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
      <ScrollView contentContainerStyle={[styles.joinContainer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>

        <Text style={[styles.joinTitle, { color: colors.foreground }]}>Join a Room</Text>
        <Text style={[styles.joinSub, { color: colors.mutedForeground }]}>
          Enter the 4-letter code from the host
        </Text>

        <View style={[styles.codeInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <TextInput
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
            placeholder="XXXX"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.codeInputText, { color: colors.foreground }]}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={4}
            textAlign="center"
            returnKeyType="go"
            onSubmitEditing={onJoin}
          />
        </View>

        <Pressable
          onPress={onScanPress}
          style={[styles.scanBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Feather name="camera" size={18} color={colors.mutedForeground} />
          <Text style={[styles.scanBtnText, { color: colors.mutedForeground }]}>Scan QR Code</Text>
        </Pressable>

        {joinError ? (
          <View style={[styles.errorBox, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b44", borderRadius: colors.radius }]}>
            <Feather name="wifi-off" size={14} color="#f59e0b" />
            <Text style={styles.joinErrorText}>{joinError}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onJoin}
          disabled={codeInput.length !== 4 || joining}
          style={({ pressed }) => [
            styles.joinBtn,
            { backgroundColor: colors.primary, opacity: (codeInput.length !== 4 || joining) ? 0.5 : pressed ? 0.85 : 1, borderRadius: colors.radius },
          ]}
        >
          {joining
            ? <ActivityIndicator color={colors.primaryForeground} size="small" />
            : <><Text style={[styles.joinBtnText, { color: colors.primaryForeground }]}>Join Room</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  joinContainer: { paddingHorizontal: 24, gap: 16 },
  joinTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginTop: 12 },
  joinSub: { fontSize: 15, fontFamily: "Inter_400Regular" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  codeInput: { borderWidth: 1, paddingVertical: 0, marginVertical: 8 },
  codeInputText: { fontSize: 48, fontFamily: "Inter_700Bold", letterSpacing: 12, paddingVertical: 20 },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderWidth: 1 },
  scanBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  joinBtnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1 },
  joinErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#f59e0b" },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center" },
  scanBack: { alignSelf: "flex-start", marginLeft: 16, width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 22 },
  scanFrame: { width: 220, height: 220, borderWidth: 2, borderColor: "#fff", borderRadius: 16, marginTop: 60 },
  scanHint: { color: "#fff", marginTop: 20, fontSize: 15, fontFamily: "Inter_400Regular" },
  activeContainer: { paddingHorizontal: 24, gap: 8, alignItems: "center" },
  activeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" },
  roomBadge: { flexDirection: "row", alignItems: "baseline" },
  roomBadgeText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  roomBadgeCode: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  warnTag: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bigIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  trackName: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  trackArtist: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bgNote: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 28 },
  connectBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  leaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, borderWidth: 1 },
  leaveBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  helpRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  helpText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  helpBox: { padding: 14, gap: 8, borderWidth: 1 },
  helpBoxText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  uriBox: { padding: 10 },
  uriText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  gpsBadgeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
