import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSync } from "@/context/SyncContext";

export default function MusicTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connStatus } = useSync();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const connColor =
    connStatus === "connected"
      ? colors.primary
      : connStatus === "connecting"
        ? "#f59e0b"
        : colors.mutedForeground;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0a2040", colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.container, { paddingTop: topPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.logoText, { color: colors.foreground }]}>SyncWave</Text>
          </View>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Listen together in real time
          </Text>
          <View style={styles.connRow}>
            <View style={[styles.connDot, { backgroundColor: connColor }]} />
            <Text style={[styles.connText, { color: colors.mutedForeground }]}>
              {connStatus === "connected"
                ? "Connected"
                : connStatus === "connecting"
                  ? "Connecting…"
                  : "Offline"}
            </Text>
          </View>
        </View>

        <View style={styles.cards}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/host");
            }}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
          >
            <LinearGradient
              colors={[colors.primary + "22", colors.primary + "08"]}
              style={[styles.cardGradient, { borderColor: colors.primary + "44", borderRadius: colors.radius }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="radio-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Host a Room</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Share radio or Spotify with friends
              </Text>
              <View style={[styles.cardArrow, { backgroundColor: colors.primary }]}>
                <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/join");
            }}
            style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
          >
            <LinearGradient
              colors={[colors.secondary + "cc", colors.muted + "cc"]}
              style={[styles.cardGradient, { borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
                <Ionicons name="people-outline" size={28} color={colors.foreground} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Join a Room</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Enter a code or scan a QR
              </Text>
              <View style={[styles.cardArrow, { backgroundColor: colors.secondary }]}>
                <Feather name="arrow-right" size={16} color={colors.foreground} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Radio listeners stay synced even in the background
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 24, paddingBottom: 120 },
  header: { alignItems: "center", gap: 8, marginBottom: 40 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoDot: { width: 10, height: 10, borderRadius: 5 },
  logoText: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  connRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cards: { gap: 14 },
  card: { borderRadius: 16, overflow: "hidden" },
  cardGradient: { padding: 20, borderWidth: 1, gap: 6 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  cardTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  cardArrow: { alignSelf: "flex-end", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  footer: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 28 },
});
