import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { Player } from "@/context/GolfContext";

export default function SetupScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startRound } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const course = getCourseById(courseId ?? "");

  const [localPlayers, setLocalPlayers] = useState<Player[]>([
    { id: "p1", name: "Player 1", handicap: 18 },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const handleStart = () => {
    if (!course) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startRound(course, localPlayers);
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Players</Text>

        {localPlayers.map((player, idx) => (
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
        ))}

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
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Course Info</Text>
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
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 },
  infoItem: { minWidth: "40%", gap: 2 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, marginTop: 8 },
  startBtnText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});
