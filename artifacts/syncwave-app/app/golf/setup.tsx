import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGolf } from "@/context/GolfContext";
import { getCourseById } from "@/data/courses";
import { enrichWithOSMHoles } from "@/lib/overpassCourses";
import { cacheCourse } from "@/lib/courseCache";
import { TEAM_DEFS } from "@/lib/teams";
import { requestNotificationPermission } from "@/lib/roundNotification";
import type { GolfCourse, GolfHole, Player } from "@/context/GolfContext";

export default function SetupScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startRound } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const baseCourse = getCourseById(courseId ?? "");

  const [enrichedHoles, setEnrichedHoles] = useState<GolfHole[] | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState(false);

  const [localPlayers, setLocalPlayers] = useState<Player[]>([
    { id: "p1", name: "Player 1", handicap: 18 },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teamsEnabled, setTeamsEnabled] = useState(false);

  // Derive the course center from the first hole's tee (OSM courses) or midpoint
  useEffect(() => {
    if (!baseCourse) return;
    // Only enrich OSM courses — featured courses have manually set coordinates
    if (!courseId?.startsWith("osm-")) return;

    const firstHole = baseCourse.holes[0];
    if (!firstHole) return;

    const center = { lat: firstHole.tee.lat, lng: firstHole.tee.lng };

    setEnriching(true);
    enrichWithOSMHoles(center, baseCourse.holes)
      .then(({ holes, enriched: wasEnriched }) => {
        if (wasEnriched) {
          setEnrichedHoles(holes);
          setEnriched(true);
          // Update cache with enriched course
          cacheCourse({ ...baseCourse, holes });
        }
      })
      .catch(() => {})
      .finally(() => setEnriching(false));
  }, [courseId]);

  const course: GolfCourse | null = baseCourse
    ? { ...baseCourse, holes: enrichedHoles ?? baseCourse.holes }
    : null;

  const addPlayer = () => {
    if (localPlayers.length >= 6) {
      Alert.alert("Max Players", "You can add up to 6 players.");
      return;
    }
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
    setLocalPlayers((prev) => [
      ...prev,
      { id, name: `Player ${prev.length + 1}`, handicap: 18 },
    ]);
  };

  const removePlayer = (id: string) => {
    if (localPlayers.length <= 1) return;
    setLocalPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const cycleTeam = (id: string) => {
    Haptics.selectionAsync();
    setLocalPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const currentIdx = TEAM_DEFS.findIndex((t) => t.id === p.teamId);
        const nextIdx = (currentIdx + 1) % TEAM_DEFS.length;
        return { ...p, teamId: TEAM_DEFS[nextIdx].id };
      })
    );
  };

  const updateName = (id: string, name: string) => {
    setLocalPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  };

  const updateHandicap = (id: string, val: string) => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 0 && n <= 54) {
      setLocalPlayers((prev) =>
        prev.map((p) => (p.id === id ? { ...p, handicap: n } : p))
      );
    }
  };

  const handleStart = async () => {
    if (!course) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Request notification permission before starting — good moment to ask.
    // Wrapped in try/catch so a permission error never blocks the round from starting.
    try {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        const granted = await requestNotificationPermission();
        if (!granted) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              "Enable Notifications",
              "Turn on notifications to see your current hole and score on the lock screen during your round.",
              [
                { text: "Not Now", style: "cancel", onPress: () => resolve() },
                {
                  text: "Open Settings",
                  onPress: () => { Linking.openSettings(); resolve(); },
                },
              ]
            );
          });
        }
      }
    } catch {
      // Notification permission failing should never block starting the round
    }

    // Strip teamId from all players if teams are disabled
    const playersToStart = teamsEnabled
      ? localPlayers
      : localPlayers.map(({ teamId: _t, ...rest }) => rest);
    startRound(course, playersToStart);
    router.replace("/golf/round");
  };

  if (!course) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.foreground }]}>Course not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d2a18", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{course.name}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {course.location} • Par {course.par}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Players header + Teams toggle */}
        <View style={styles.playersSectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Players</Text>
          <View style={styles.teamsToggleRow}>
            <Text style={[styles.teamsToggleLabel, { color: colors.mutedForeground }]}>Teams</Text>
            <Switch
              value={teamsEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setTeamsEnabled(v);
                if (v) {
                  // Assign everyone to Team 1 to start
                  setLocalPlayers((prev) =>
                    prev.map((p, i) => ({ ...p, teamId: TEAM_DEFS[i % TEAM_DEFS.length].id }))
                  );
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={teamsEnabled ? colors.primary : colors.mutedForeground}
            />
          </View>
        </View>

        {localPlayers.map((player, idx) => {
          const teamDef = teamsEnabled
            ? TEAM_DEFS.find((t) => t.id === player.teamId) ?? TEAM_DEFS[0]
            : null;
          return (
            <View
              key={player.id}
              style={[styles.playerRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <View style={[styles.playerNumber, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.playerNumberText, { color: colors.primary }]}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground }]}
                  value={player.name}
                  onChangeText={(t) => updateName(player.id, t)}
                  placeholder="Player name"
                  placeholderTextColor={colors.mutedForeground}
                  onFocus={() => setEditingId(player.id)}
                  onBlur={() => setEditingId(null)}
                />
                <View style={styles.handicapRow}>
                  <Text style={[styles.handicapLabel, { color: colors.mutedForeground }]}>HCP</Text>
                  <TextInput
                    style={[styles.handicapInput, { color: colors.foreground, borderColor: colors.border }]}
                    value={String(player.handicap)}
                    onChangeText={(t) => updateHandicap(player.id, t)}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>
              {teamsEnabled && teamDef && (
                <Pressable
                  onPress={() => cycleTeam(player.id)}
                  style={[styles.teamChip, { backgroundColor: teamDef.color + "22", borderColor: teamDef.color }]}
                  hitSlop={4}
                >
                  <Text style={[styles.teamChipText, { color: teamDef.color }]}>{teamDef.label}</Text>
                </Pressable>
              )}
              {localPlayers.length > 1 && (
                <Pressable
                  onPress={() => removePlayer(player.id)}
                  style={styles.removeBtn}
                  hitSlop={8}
                >
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          );
        })}

        <Pressable
          onPress={addPlayer}
          style={({ pressed }) => [
            styles.addPlayerBtn,
            { opacity: pressed ? 0.8 : 1, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[styles.addPlayerText, { color: colors.primary }]}>Add Player</Text>
        </Pressable>

        {/* Course info card */}
        <View style={[styles.courseInfoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.courseInfoHeader}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Course Info</Text>
            {enriching && (
              <View style={styles.enrichingBadge}>
                <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                <Text style={[styles.enrichingText, { color: colors.mutedForeground }]}>Loading GPS data…</Text>
              </View>
            )}
            {enriched && !enriching && (
              <View style={styles.enrichingBadge}>
                <Feather name="map-pin" size={11} color={colors.primary} />
                <Text style={[styles.enrichingText, { color: colors.primary }]}>Real GPS data</Text>
              </View>
            )}
          </View>
          <View style={styles.infoGrid}>
            <InfoItem label="Holes" value={String(course.holes.length)} colors={colors} />
            <InfoItem label="Par" value={String(course.par)} colors={colors} />
            <InfoItem
              label="Total Yds"
              value={course.holes.reduce((s, h) => s + h.yards.white, 0).toLocaleString()}
              colors={colors}
            />
            <InfoItem label="Location" value={course.location} colors={colors} />
          </View>
        </View>

        <Pressable
          onPress={handleStart}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primary + "cc"]}
            style={[styles.startBtn, { borderRadius: colors.radius }]}
          >
            <Text style={[styles.startBtnText, { color: colors.primaryForeground }]}>
              Start Round
            </Text>
            <Feather name="flag" size={20} color={colors.primaryForeground} />
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function InfoItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 100 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  playersSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  teamsToggleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamsToggleLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  teamChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5, marginRight: 4 },
  teamChipText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  playerRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, borderWidth: 1 },
  playerNumber: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  playerNumberText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  nameInput: { fontSize: 16, fontFamily: "Inter_500Medium", paddingVertical: 2 },
  handicapRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  handicapLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  handicapInput: { fontSize: 13, fontFamily: "Inter_500Medium", borderBottomWidth: 1, paddingHorizontal: 4, paddingVertical: 1, minWidth: 28, textAlign: "center" },
  removeBtn: { padding: 4 },
  addPlayerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderWidth: 1, borderStyle: "dashed" },
  addPlayerText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  courseInfoCard: { padding: 16, borderWidth: 1, marginTop: 4 },
  courseInfoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 0 },
  enrichingBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  enrichingText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 },
  infoItem: { minWidth: "40%", gap: 2 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, marginTop: 8 },
  startBtnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});
