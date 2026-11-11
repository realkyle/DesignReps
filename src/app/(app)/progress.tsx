import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/components/theme";
import { usePlayer } from "@/hooks/usePlayer";
import type { LevelProgress, StreakStatus } from "@/lib/learning";

/** Progress: how close the player is to the next level, and their current and best streak. */
export default function ProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { player, error, reload } = usePlayer();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Your progress</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      {!player && !error && <Text style={styles.muted}>Loading…</Text>}

      {player && (
        <>
          <LevelCard level={player.level} />
          <StreakCard streak={player.streak} />
          <Text style={styles.muted}>Lessons earn 10 XP and scenarios 25 XP the first time you finish them.</Text>
        </>
      )}
    </ScrollView>
  );
}

function LevelCard({ level }: { level: LevelProgress }) {
  const percent = Math.round(level.fraction * 100);
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Level</Text>
      <Text style={styles.big}>Level {level.level}</Text>
      <View
        style={styles.barTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={`Progress to level ${level.level + 1}`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      {level.isMaxLevel ? (
        <Text style={styles.body}>Max level reached · {level.xp} XP</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {level.xp} / {level.nextLevelXp} XP
          </Text>
          <Text style={styles.muted}>
            {level.xpToNextLevel} XP to Level {level.level + 1}
          </Text>
        </>
      )}
    </View>
  );
}

function StreakCard({ streak }: { streak: StreakStatus }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Streak</Text>
      <Text style={[styles.big, streak.current > 0 && styles.streak]}>🔥 {days(streak.current)}</Text>
      <Text style={[styles.body, streak.state === "atRisk" && styles.atRisk]}>{streakMessage(streak)}</Text>
      <Text style={styles.muted}>Best: {days(streak.longest)}</Text>
    </View>
  );
}

function streakMessage(streak: StreakStatus): string {
  switch (streak.state) {
    case "doneToday":
      return "Done for today ✓ Come back tomorrow to keep it going.";
    case "atRisk":
      return "Complete a lesson today to keep your streak.";
    case "none":
      return streak.longest > 0 ? "Complete a lesson to start a new streak." : "Complete a lesson to start your streak.";
  }
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, gap: 16 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  card: { gap: 8, padding: 18, borderRadius: 18, backgroundColor: colors.surface },
  cardLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  big: { fontSize: 26, fontWeight: "800", color: colors.text },
  streak: { color: colors.streak },
  body: { fontSize: 16, color: colors.text },
  atRisk: { fontWeight: "700", color: colors.danger },
  muted: { fontSize: 14, color: colors.textMuted },
  error: { fontSize: 15, color: colors.danger },
  barTrack: { height: 14, borderRadius: 7, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 7, backgroundColor: colors.primary },
});
