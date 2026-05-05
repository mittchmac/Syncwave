import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import * as Location from "expo-location";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useGolf } from "@/context/GolfContext";
import { FEATURED_COURSES, searchCourses } from "@/data/courses";
import { searchNearby, searchByName } from "@/lib/overpassCourses";
import type { GolfCourse } from "@/context/GolfContext";

type NearbyStatus = "idle" | "requesting" | "loading" | "done" | "denied" | "error";

export default function GolfTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isRoundActive, course, currentHole, players, scoreToPar, endRound } = useGolf();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GolfCourse[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [nearbyCourses, setNearbyCourses] = useState<GolfCourse[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<NearbyStatus>("idle");

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localResults = searchCourses(query);

  // ── GPS nearby on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (isRoundActive) return;
    let cancelled = false;

    (async () => {
      setNearbyStatus("requesting");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") { setNearbyStatus("denied"); return; }

      setNearbyStatus("loading");
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const courses = await searchNearby(loc.coords.latitude, loc.coords.longitude, 40000);
        if (cancelled) return;
        setNearbyCourses(courses);
        setNearbyStatus("done");
      } catch {
        if (!cancelled) setNearbyStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [isRoundActive]);

  // ── Debounced text search ────────────────────────────────────────────────
  const onQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (text.trim().length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchByName(text.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 600);
  }, []);

  if (isRoundActive && course) return <ActiveRoundSummary />;

  const isSearching = query.trim().length > 0;
  const allSearchResults: GolfCourse[] = isSearching
    ? dedupeById([...localResults, ...searchResults])
    : [];

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

        {/* Search box */}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {searchLoading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Feather name="search" size={16} color={colors.mutedForeground} />}
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search any golf course worldwide…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={onQueryChange}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setSearchResults([]); }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Search results */}
        {isSearching ? (
          <>
            <SectionHeader
              label={searchLoading ? "Searching…" : `${allSearchResults.length} result${allSearchResults.length !== 1 ? "s" : ""}`}
            />
            {allSearchResults.length === 0 && !searchLoading && (
              <EmptyState icon="map" text="No courses found. Try a different name." />
            )}
            {allSearchResults.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </>
        ) : (
          <>
            {/* GPS nearby section */}
            <NearbySection status={nearbyStatus} courses={nearbyCourses} />

            {/* Featured courses */}
            <SectionHeader label="Featured Courses" />
            {FEATURED_COURSES.map((c) => (
              <CourseCard key={c.id} course={c} featured />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NearbySection({ status, courses }: { status: NearbyStatus; courses: GolfCourse[] }) {
  const colors = useColors();

  if (status === "idle" || status === "requesting") return null;

  if (status === "loading") {
    return (
      <>
        <SectionHeader label="Nearby Courses" />
        <View style={[styles.nearbyLoader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.nearbyLoaderText, { color: colors.mutedForeground }]}>
            Finding courses near you…
          </Text>
        </View>
      </>
    );
  }

  if (status === "denied") {
    return (
      <>
        <SectionHeader label="Nearby Courses" />
        <View style={[styles.nearbyLoader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="map-pin" size={16} color={colors.mutedForeground} />
          <Text style={[styles.nearbyLoaderText, { color: colors.mutedForeground }]}>
            Enable location to see courses near you
          </Text>
        </View>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <SectionHeader label="Nearby Courses" />
        <View style={[styles.nearbyLoader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="wifi-off" size={16} color={colors.mutedForeground} />
          <Text style={[styles.nearbyLoaderText, { color: colors.mutedForeground }]}>
            Could not load nearby courses
          </Text>
        </View>
      </>
    );
  }

  if (courses.length === 0) return null;

  return (
    <>
      <SectionHeader label={`Nearby · ${courses.length} found`} />
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} />
      ))}
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Feather name={icon as never} size={36} color={colors.mutedForeground} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

function CourseCard({ course, featured }: { course: GolfCourse; featured?: boolean }) {
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
          <View style={styles.courseNameRow}>
            <Text style={[styles.courseName, { color: colors.foreground }]} numberOfLines={1}>
              {course.name}
            </Text>
            {featured && (
              <View style={[styles.featuredPip, { backgroundColor: colors.primary + "33" }]}>
                <Text style={[styles.featuredPipText, { color: colors.primary }]}>★</Text>
              </View>
            )}
          </View>
          <View style={styles.courseMeta}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.courseLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
              {course.location}
            </Text>
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
          <Pressable onPress={() => router.push("/golf/round")} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
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

        {[...players].sort((a, b) => scoreToPar(a.id) - scoreToPar(b.id)).map((p, i) => {
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
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); endRound(); }}
          style={({ pressed }) => [styles.endBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.endBtnText, { color: colors.destructive }]}>End Round</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dedupeById(courses: GolfCourse[]): GolfCourse[] {
  const seen = new Set<string>();
  return courses.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 20, paddingBottom: 120 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  flagIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, marginTop: 6 },
  courseCard: { marginBottom: 10 },
  courseCardInner: { flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1 },
  courseInfo: { flex: 1, gap: 4 },
  courseNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  courseName: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1 },
  featuredPip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  featuredPipText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  courseMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  courseLocation: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  courseBadges: { flexDirection: "row", gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  courseArrow: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  nearbyLoader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  nearbyLoaderText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  activeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
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
