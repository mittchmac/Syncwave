import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGolf } from "@/context/GolfContext";
import { TEAM_DEFS } from "@/lib/teams";
import { distanceYards } from "@/lib/gpsDistance";
import {
  requestNotificationPermission,
  showRoundNotification,
  dismissRoundNotification,
} from "@/lib/roundNotification";

export default function RoundScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { course, currentHole, setCurrentHole, players, holeScore, setScore, scoreToPar, activeTeamIds, teamScoreToPar, teamTotalScore } =
    useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [notifPerm, setNotifPerm] = useState(false);

  const hole = course?.holes[currentHole - 1];

  // Request notification permission once on mount, dismiss on leave
  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      setNotifPerm(granted);
    });
    return () => {
      dismissRoundNotification().catch(() => {});
    };
  }, []);

  // Pulse animation for GPS dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Start GPS watch
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      if (Platform.OS === "web") {
        setLocationError("GPS not available in browser preview");
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied");
        return;
      }
      setWatching(true);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      );
      watchRef.current = sub;
    })();
    return () => {
      sub?.remove();
    };
  }, []);

  const distanceToPin = location && hole
    ? distanceYards(location.lat, location.lng, hole.pin.lat, hole.pin.lng)
    : null;

  const distanceToTee = location && hole
    ? distanceYards(location.lat, location.lng, hole.tee.lat, hole.tee.lng)
    : null;

  const holeLength = hole ? hole.yards.white : 0;

  // Update the lock screen notification whenever hole or distance changes
  useEffect(() => {
    if (!notifPerm || !course || !hole) return;
    showRoundNotification({
      hole: currentHole,
      totalHoles: course.holes.length,
      par: hole.par,
      distanceToPin: distanceToPin ?? null,
      scoreToPar: scoreToPar(players[0]?.id ?? "p1"),
      courseName: course.name,
    }).catch(() => {});
  }, [currentHole, distanceToPin, course, hole, scoreToPar, players]);

  const goToPrevHole = () => {
    if (currentHole > 1) {
      Haptics.selectionAsync();
      setCurrentHole(currentHole - 1);
    }
  };

  const goToNextHole = () => {
    if (course && currentHole < course.holes.length) {
      Haptics.selectionAsync();
      setCurrentHole(currentHole + 1);
    }
  };

  if (!course || !hole) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={[styles.noRound, { color: colors.mutedForeground }]}>No active round</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d2a18", "#061510"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {course.name}
        </Text>
        <Pressable onPress={() => router.push("/golf/scorecard")} style={styles.scorecardBtn}>
          <Feather name="list" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hole number display */}
        <View style={styles.holeNav}>
          <Pressable onPress={goToPrevHole} style={({ pressed }) => [styles.navBtn, { opacity: pressed || currentHole <= 1 ? 0.4 : 1 }]}>
            <Feather name="chevron-left" size={28} color={colors.foreground} />
          </Pressable>

          <View style={styles.holeInfo}>
            <Text style={[styles.holeLabel, { color: colors.primary }]}>HOLE</Text>
            <Text style={[styles.holeNumber, { color: colors.foreground }]}>{currentHole}</Text>
            <View style={[styles.parBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.parText, { color: colors.primary }]}>Par {hole.par}</Text>
            </View>
          </View>

          <Pressable onPress={goToNextHole} style={({ pressed }) => [styles.navBtn, { opacity: pressed || currentHole >= course.holes.length ? 0.4 : 1 }]}>
            <Feather name="chevron-right" size={28} color={colors.foreground} />
          </Pressable>
        </View>

        {/* GPS Distance Card */}
        <View style={[styles.gpsCard, { backgroundColor: "rgba(30,60,35,0.7)", borderColor: colors.primary + "33" }]}>
          <View style={styles.gpsHeader}>
            <View style={styles.gpsDotRow}>
              <Animated.View style={[styles.gpsPulse, { backgroundColor: colors.primary + "33", transform: [{ scale: pulseAnim }] }]} />
              <View style={[styles.gpsDot, { backgroundColor: watching ? colors.primary : colors.mutedForeground }]} />
            </View>
            <Text style={[styles.gpsStatus, { color: watching ? colors.primary : colors.mutedForeground }]}>
              {locationError ? locationError : watching ? "GPS Active" : "Acquiring GPS…"}
            </Text>
          </View>

          {distanceToPin !== null ? (
            <View style={styles.distanceGrid}>
              <View style={styles.distanceItem}>
                <Text style={[styles.distanceValue, { color: colors.foreground }]}>
                  {distanceToPin}
                </Text>
                <Text style={[styles.distanceUnit, { color: colors.mutedForeground }]}>yds to pin</Text>
              </View>
              <View style={[styles.distanceDivider, { backgroundColor: colors.border }]} />
              <View style={styles.distanceItem}>
                <Text style={[styles.distanceValue, { color: colors.foreground }]}>
                  {distanceToTee}
                </Text>
                <Text style={[styles.distanceUnit, { color: colors.mutedForeground }]}>yds from tee</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noGps}>
              <Text style={[styles.noGpsText, { color: colors.mutedForeground }]}>
                {locationError ? "Enable location for GPS distances" : "Getting your location…"}
              </Text>
            </View>
          )}
        </View>

        {/* Yardages */}
        <View style={[styles.yardsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.yardsTitle, { color: colors.mutedForeground }]}>Yardage</Text>
          <View style={styles.yardsGrid}>
            {(["black", "blue", "white", "red"] as const).map((tee) => (
              <View key={tee} style={styles.yardsItem}>
                <View style={[styles.teeDot, { backgroundColor: teeColor(tee) }]} />
                <Text style={[styles.yardValue, { color: colors.foreground }]}>{hole.yards[tee]}</Text>
                <Text style={[styles.yardLabel, { color: colors.mutedForeground }]}>{tee}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Hole Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Handicap" value={`#${hole.handicap}`} colors={colors} />
          <StatCard label="Total Yds" value={`${holeLength}`} colors={colors} />
          <StatCard label="Hole" value={`${currentHole}/${course.holes.length}`} colors={colors} />
        </View>

        {/* Quick score entry */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Score This Hole</Text>
        {players.map((p) => (
          <QuickScoreRow
            key={p.id}
            player={p}
            hole={currentHole}
            par={hole.par}
            colors={colors}
          />
        ))}

        {/* Team standings (only shown if teams are configured) */}
        {activeTeamIds.length >= 2 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Team Standings</Text>
            <View style={[styles.teamStandingsCard, { backgroundColor: "rgba(30,60,35,0.7)", borderColor: colors.primary + "33" }]}>
              {[...activeTeamIds]
                .sort((a, b) => teamScoreToPar(a) - teamScoreToPar(b))
                .map((teamId, rank) => {
                  const def = TEAM_DEFS.find((t) => t.id === teamId);
                  if (!def) return null;
                  const diff = teamScoreToPar(teamId);
                  const total = teamTotalScore(teamId);
                  const teamPlayers = players.filter((p) => p.teamId === teamId);
                  return (
                    <View
                      key={teamId}
                      style={[
                        styles.teamRow,
                        rank < activeTeamIds.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.primary + "22" },
                      ]}
                    >
                      <View style={[styles.teamColorDot, { backgroundColor: def.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.teamName, { color: colors.foreground }]}>{def.label}</Text>
                        <Text style={[styles.teamPlayers, { color: colors.mutedForeground }]}>
                          {teamPlayers.map((p) => p.name).join(", ")}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        {total > 0 ? (
                          <>
                            <Text style={[styles.teamTotal, { color: def.color }]}>{total}</Text>
                            <Text style={[styles.teamDiff, { color: diff < 0 ? colors.primary : diff > 0 ? "#f59e0b" : colors.mutedForeground }]}>
                              {diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.teamTotal, { color: colors.mutedForeground }]}>—</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function QuickScoreRow({
  player,
  hole,
  par,
  colors,
}: {
  player: { id: string; name: string };
  hole: number;
  par: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const { holeScore, setScore } = useGolf();
  const score = holeScore(hole, player.id);
  const options = [par - 2, par - 1, par, par + 1, par + 2, par + 3].filter(
    (v) => v >= 1
  );

  return (
    <View style={[styles.scoreRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <Text style={[styles.playerName, { color: colors.foreground }]}>{player.name}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreOptions}>
        {options.map((n) => {
          const diff = n - par;
          const isSelected = score === n;
          const dotColor =
            diff <= -2 ? "#f5c518" : diff === -1 ? colors.primary : diff === 0 ? colors.foreground : diff === 1 ? "#f59e0b" : "#e03434";
          return (
            <Pressable
              key={n}
              onPress={() => {
                Haptics.selectionAsync();
                setScore(hole, player.id, isSelected ? null : n);
              }}
              style={[
                styles.scoreBtn,
                isSelected && { backgroundColor: dotColor + "22", borderColor: dotColor },
                !isSelected && { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.scoreBtnText, { color: isSelected ? dotColor : colors.mutedForeground }]}>
                {n}
              </Text>
              {diff !== 0 && (
                <Text style={[styles.scoreDiff, { color: isSelected ? dotColor : colors.mutedForeground + "88" }]}>
                  {diff > 0 ? `+${diff}` : `${diff}`}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StatCard({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function teeColor(tee: "black" | "blue" | "white" | "red"): string {
  switch (tee) {
    case "black": return "#1a1a1a";
    case "blue": return "#1e6fbb";
    case "white": return "#f0f0f0";
    case "red": return "#e03434";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noRound: { fontSize: 16, textAlign: "center", marginTop: 100, fontFamily: "Inter_400Regular" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  scorecardBtn: { padding: 6 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  holeNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  navBtn: { padding: 12 },
  holeInfo: { alignItems: "center", gap: 4 },
  holeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  holeNumber: { fontSize: 72, fontFamily: "Inter_700Bold", lineHeight: 80 },
  parBadge: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 20 },
  parText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  gpsCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  gpsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  gpsDotRow: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  gpsPulse: { position: "absolute", width: 16, height: 16, borderRadius: 8 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsStatus: { fontSize: 12, fontFamily: "Inter_500Medium" },
  distanceGrid: { flexDirection: "row", alignItems: "center" },
  distanceItem: { flex: 1, alignItems: "center", gap: 2 },
  distanceDivider: { width: 1, height: 40, marginHorizontal: 8 },
  distanceValue: { fontSize: 48, fontFamily: "Inter_700Bold", lineHeight: 56 },
  distanceUnit: { fontSize: 12, fontFamily: "Inter_400Regular" },
  noGps: { alignItems: "center", paddingVertical: 12 },
  noGpsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  yardsCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  yardsTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
  yardsGrid: { flexDirection: "row", justifyContent: "space-around" },
  yardsItem: { alignItems: "center", gap: 4 },
  teeDot: { width: 12, height: 12, borderRadius: 6 },
  yardValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  yardLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase" },
  teamStandingsCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  teamRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  teamColorDot: { width: 12, height: 12, borderRadius: 6 },
  teamName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  teamPlayers: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  teamTotal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  teamDiff: { fontSize: 11, fontFamily: "Inter_500Medium" },
  scoreRow: { borderWidth: 1, padding: 12, gap: 10 },
  playerName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scoreOptions: { gap: 8, paddingRight: 4 },
  scoreBtn: { width: 48, height: 52, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 1 },
  scoreBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scoreDiff: { fontSize: 10, fontFamily: "Inter_400Regular" },
});
