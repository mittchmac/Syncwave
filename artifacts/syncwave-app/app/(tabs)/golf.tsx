import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useGolf } from "@/context/GolfContext";
import { searchCourses, GolfCourse } from "@/data/courses";

export default function GolfTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRoundActive, course, currentHole, round, players, scoreToPar, endRound } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const results = searchCourses(query);

  if (isRoundActive && course) {
    return <ActiveRoundSummary />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d2a18", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.container, { paddingTop: topPad + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View style={[styles.flagIcon, { backgroundColor: colors.primary + "22" }]}>
            {Platform.OS === "ios" ? (
              <SymbolView name="flag.fill" tintColor={colors.primary} size={22} />
            ) : (
              <Feather name="flag" size={22} color={colors.primary} />
            )}
          </View>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>FairwayCaddie</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Select a course to start your round
            </Text>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search courses…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {query ? `${results.length} result${results.length !== 1 ? "s" : ""}` : "Featured Courses"}
        </Text>

        {results.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}

        {results.length === 0 && (
          <View style={styles.empty}>
            <Feather name="map" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No courses found
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CourseCard({ course }: { course: GolfCourse }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/golf/setup", params: { courseId: course.id } });
      }}
      style={({ pressed }) => [styles.courseCard, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.courseCardInner, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.courseInfo}>
          <Text style={[styles.courseName, { color: colors.foreground }]}>{course.name}</Text>
          <View style={styles.courseMeta}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.courseLocation, { color: colors.mutedForeground }]}>{course.location}</Text>
          </View>
          <View style={styles.courseBadges}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>Par {course.par}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{course.holes.length} holes</Text>
            </View>
          </View>
        </View>
        <View style={[styles.courseArrow, { backgroundColor: colors.primary }]}>
          <Feather name="chevron-right" size={18} color={colors.primaryForeground} />
        </View>
      </View>
    </Pressable>
  );
}

function ActiveRoundSummary() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { course, currentHole, players, scoreToPar, totalScore, endRound } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0d2a18", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.container, { paddingTop: topPad + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.activeLabel, { color: colors.primary }]}>Round in Progress</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{course?.name}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Hole {currentHole} of {course?.holes.length}</Text>

        <View style={styles.activeButtons}>
          <Pressable
            onPress={() => router.push("/golf/round")}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            <LinearGradient
              colors={[colors.primary, colors.primary + "cc"]}
              style={[styles.primaryBtn, { borderRadius: colors.radius }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Continue Round</Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => router.push("/golf/scorecard")}
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.85 : 1, backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <Feather name="list" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Scorecard</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Leaderboard</Text>

        {[...players]
          .sort((a, b) => scoreToPar(a.id) - scoreToPar(b.id))
          .map((p, i) => {
            const diff = scoreToPar(p.id);
            return (
              <View key={p.id} style={[styles.leaderRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.leaderRank, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                <Text style={[styles.leaderName, { color: colors.foreground }]}>{p.name}</Text>
                <Text style={[styles.leaderScore, { color: diff < 0 ? colors.primary : diff > 0 ? "#f59e0b" : colors.foreground }]}>
                  {diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                </Text>
              </View>
            );
          })}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            endRound();
          }}
          style={({ pressed }) => [styles.endBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.endBtnText, { color: colors.destructive }]}>End Round</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 20, paddingBottom: 120 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  flagIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
  courseCard: { marginBottom: 10 },
  courseCardInner: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1 },
  courseInfo: { flex: 1, gap: 4 },
  courseName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  courseMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  courseLocation: { fontSize: 13, fontFamily: "Inter_400Regular" },
  courseBadges: { flexDirection: "row", gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  courseArrow: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  activeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  activeButtons: { gap: 10, marginTop: 20, marginBottom: 28 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderWidth: 1 },
  secondaryBtnText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  leaderRow: { flexDirection: "row", alignItems: "center", padding: 14, marginBottom: 8, borderWidth: 1 },
  leaderRank: { fontSize: 13, fontFamily: "Inter_400Regular", width: 28 },
  leaderName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  leaderScore: { fontSize: 18, fontFamily: "Inter_700Bold" },
  endBtn: { alignItems: "center", paddingVertical: 16, marginTop: 20 },
  endBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
