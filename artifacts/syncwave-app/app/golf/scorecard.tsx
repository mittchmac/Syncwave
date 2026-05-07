import React, { useState } from "react";
import {
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
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGolf } from "@/context/GolfContext";
import { getScoreColor, getScoreLabel } from "@/data/courses";
import { TEAM_DEFS } from "@/lib/teams";

export default function ScorecardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { course, players, holeScore, setScore, currentHole, setCurrentHole, scoreToPar, totalScore, activeTeamIds, teamTotalScore, teamScoreToPar } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedHole, setSelectedHole] = useState(currentHole);
  const [editPlayer, setEditPlayer] = useState<string | null>(null);

  if (!course) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={[styles.noRound, { color: colors.mutedForeground }]}>No active round</Text>
      </View>
    );
  }

  const hole = course.holes[selectedHole - 1];

  const handleScoreChange = (playerId: string, delta: number) => {
    const current = holeScore(selectedHole, playerId) ?? hole.par;
    const next = Math.max(1, current + delta);
    Haptics.selectionAsync();
    setScore(selectedHole, playerId, next);
  };

  const clearScore = (playerId: string) => {
    setScore(selectedHole, playerId, null);
  };

  // Front nine / back nine totals
  const frontNine = course.holes.slice(0, 9);
  const backNine = course.holes.slice(9, 18);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d2a18", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.35 }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Scorecard</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hole selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.holePicker}
        >
          {course.holes.map((h) => {
            const isSelected = selectedHole === h.number;
            const isCurrent = currentHole === h.number;
            const allScored = players.every((p) => holeScore(h.number, p.id) !== null);
            return (
              <Pressable
                key={h.number}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedHole(h.number);
                  setCurrentHole(h.number);
                }}
                style={[
                  styles.holePill,
                  isSelected && { backgroundColor: colors.primary },
                  !isSelected && isCurrent && { borderColor: colors.primary, borderWidth: 1 },
                  !isSelected && !isCurrent && { backgroundColor: colors.card },
                  allScored && !isSelected && { backgroundColor: colors.accent },
                ]}
              >
                <Text style={[styles.holePillText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                  {h.number}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Current hole detail */}
        <View style={[styles.holeDetail, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.holeDetailHeader}>
            <Text style={[styles.holeDetailTitle, { color: colors.foreground }]}>Hole {selectedHole}</Text>
            <View style={[styles.parChip, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.parChipText, { color: colors.primary }]}>Par {hole.par}</Text>
            </View>
            <Text style={[styles.holeYards, { color: colors.mutedForeground }]}>{hole.yards.white} yds</Text>
          </View>

          {players.map((p) => {
            const score = holeScore(selectedHole, p.id);
            const isEditing = editPlayer === p.id;
            return (
              <View key={p.id} style={[styles.playerScoreRow, { borderTopColor: colors.border }]}>
                <Pressable onLongPress={() => clearScore(p.id)} style={{ flex: 1 }}>
                  <Text style={[styles.playerScoreName, { color: colors.foreground }]}>{p.name}</Text>
                  {score !== null && (
                    <Text style={[styles.scoreLabel, { color: getScoreColor(score, hole.par) }]}>
                      {getScoreLabel(score, hole.par)}
                    </Text>
                  )}
                </Pressable>

                <View style={styles.scoreControls}>
                  <Pressable
                    onPress={() => handleScoreChange(p.id, -1)}
                    style={[styles.scoreControlBtn, { backgroundColor: colors.border }]}
                  >
                    <Feather name="minus" size={16} color={colors.foreground} />
                  </Pressable>

                  <View style={[styles.scoreDisplay, { backgroundColor: score !== null ? getScoreColor(score, hole.par) + "22" : colors.muted }]}>
                    <Text style={[styles.scoreDisplayText, { color: score !== null ? getScoreColor(score, hole.par) : colors.mutedForeground }]}>
                      {score !== null ? score : "—"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleScoreChange(p.id, 1)}
                    style={[styles.scoreControlBtn, { backgroundColor: colors.border }]}
                  >
                    <Feather name="plus" size={16} color={colors.foreground} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {/* Full scorecard table */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Full Scorecard</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Table header */}
            <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.tableCell, styles.tableHoleCell, { color: colors.mutedForeground }]}>Hole</Text>
              <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>Par</Text>
              {players.map((p) => (
                <Text key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {p.name.split(" ")[0]}
                </Text>
              ))}
            </View>

            {/* Front nine */}
            {frontNine.map((h) => {
              const isCurrentHole = h.number === selectedHole;
              return (
                <Pressable
                  key={h.number}
                  onPress={() => { setSelectedHole(h.number); setCurrentHole(h.number); }}
                  style={[
                    styles.tableRow,
                    { backgroundColor: isCurrentHole ? colors.primary + "18" : h.number % 2 === 0 ? colors.card : colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.tableCell, styles.tableHoleCell, { color: isCurrentHole ? colors.primary : colors.foreground, fontFamily: isCurrentHole ? "Inter_700Bold" : "Inter_500Medium" }]}>
                    {h.number}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>{h.par}</Text>
                  {players.map((p) => {
                    const s = holeScore(h.number, p.id);
                    return (
                      <Text key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { color: s !== null ? getScoreColor(s, h.par) : colors.mutedForeground }]}>
                        {s !== null ? s : "—"}
                      </Text>
                    );
                  })}
                </Pressable>
              );
            })}

            {/* Front nine total */}
            <View style={[styles.tableRow, styles.totalRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.tableCell, styles.tableHoleCell, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>OUT</Text>
              <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>
                {frontNine.reduce((s, h) => s + h.par, 0)}
              </Text>
              {players.map((p) => {
                const total = frontNine.reduce((sum, h) => sum + (holeScore(h.number, p.id) ?? 0), 0);
                return (
                  <Text key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {total || "—"}
                  </Text>
                );
              })}
            </View>

            {/* Back nine */}
            {backNine.map((h) => {
              const isCurrentHole = h.number === selectedHole;
              return (
                <Pressable
                  key={h.number}
                  onPress={() => { setSelectedHole(h.number); setCurrentHole(h.number); }}
                  style={[
                    styles.tableRow,
                    { backgroundColor: isCurrentHole ? colors.primary + "18" : h.number % 2 === 0 ? colors.card : colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.tableCell, styles.tableHoleCell, { color: isCurrentHole ? colors.primary : colors.foreground, fontFamily: isCurrentHole ? "Inter_700Bold" : "Inter_500Medium" }]}>
                    {h.number}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>{h.par}</Text>
                  {players.map((p) => {
                    const s = holeScore(h.number, p.id);
                    return (
                      <Text key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { color: s !== null ? getScoreColor(s, h.par) : colors.mutedForeground }]}>
                        {s !== null ? s : "—"}
                      </Text>
                    );
                  })}
                </Pressable>
              );
            })}

            {/* Back nine total */}
            <View style={[styles.tableRow, styles.totalRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.tableCell, styles.tableHoleCell, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>IN</Text>
              <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>
                {backNine.reduce((s, h) => s + h.par, 0)}
              </Text>
              {players.map((p) => {
                const total = backNine.reduce((sum, h) => sum + (holeScore(h.number, p.id) ?? 0), 0);
                return (
                  <Text key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {total || "—"}
                  </Text>
                );
              })}
            </View>

            {/* Grand total */}
            <View style={[styles.tableRow, styles.grandTotalRow, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
              <Text style={[styles.tableCell, styles.tableHoleCell, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>TOT</Text>
              <Text style={[styles.tableCell, styles.tableParCell, { color: colors.mutedForeground }]}>
                {course.par}
              </Text>
              {players.map((p) => {
                const t = totalScore(p.id);
                const diff = scoreToPar(p.id);
                return (
                  <View key={p.id} style={[styles.tableCell, styles.tablePlayerCell, { alignItems: "center" }]}>
                    <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 15 }}>
                      {t || "—"}
                    </Text>
                    {t > 0 && (
                      <Text style={{ color: diff < 0 ? colors.primary : diff > 0 ? "#f59e0b" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium" }}>
                        {diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Team Scores section */}
        {activeTeamIds.length >= 2 && (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 0 }]}>Team Scores</Text>
            <View style={[styles.teamScoresCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                        { borderColor: colors.border },
                        rank > 0 && { borderTopWidth: 1 },
                      ]}
                    >
                      <Text style={[styles.teamRank, { color: colors.mutedForeground }]}>#{rank + 1}</Text>
                      <View style={[styles.teamColorDot, { backgroundColor: def.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.teamLabel, { color: colors.foreground }]}>{def.label}</Text>
                        <Text style={[styles.teamMembers, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {teamPlayers.map((p) => p.name.split(" ")[0]).join(", ")}
                        </Text>
                      </View>
                      {total > 0 ? (
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.teamTotal, { color: def.color }]}>{total}</Text>
                          <Text style={[styles.teamDiff, {
                            color: diff < 0 ? colors.primary : diff > 0 ? "#f59e0b" : colors.mutedForeground,
                          }]}>
                            {diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.teamTotal, { color: colors.mutedForeground }]}>—</Text>
                      )}
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  noRound: { fontSize: 16, textAlign: "center", marginTop: 100, fontFamily: "Inter_400Regular" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 6, width: 36 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  holePicker: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  holePill: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  holePillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  holeDetail: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, marginBottom: 20, padding: 14 },
  holeDetailHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  holeDetailTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  parChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  parChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  holeYards: { fontSize: 13, fontFamily: "Inter_400Regular" },
  playerScoreRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1 },
  playerScoreName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  scoreLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  scoreControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  scoreControlBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  scoreDisplay: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  scoreDisplayText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 8 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1 },
  tableHeader: { borderTopWidth: 1 },
  totalRow: {},
  grandTotalRow: { borderWidth: 1 },
  tableCell: { paddingVertical: 9, paddingHorizontal: 2, textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular" },
  tableHoleCell: { width: 40 },
  tableParCell: { width: 36 },
  tablePlayerCell: { width: 58 },
  teamScoresCard: { borderRadius: 14, borderWidth: 1, marginTop: 8, overflow: "hidden" },
  teamRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  teamRank: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 24 },
  teamColorDot: { width: 11, height: 11, borderRadius: 6 },
  teamLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  teamMembers: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  teamTotal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  teamDiff: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
