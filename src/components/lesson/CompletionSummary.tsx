import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/components/theme";
import type { CompletionOutcome } from "@/lib/learning";

/**
 * The results screen. Every number here comes from the server's response,
 * not from the app: XP, level, streak and unlocks are decided server-side.
 */
export function CompletionSummary({ outcome }: { outcome: CompletionOutcome }) {
  const { score, xpAwarded, totalXp, level, streak, alreadyCompleted, unlockedLessonId } = outcome;

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{alreadyCompleted ? "💪" : "🎉"}</Text>
      <Text style={styles.title}>{alreadyCompleted ? "Nice practice!" : "Lesson complete!"}</Text>
      <Text style={styles.score}>
        {score.correct} / {score.total} correct
      </Text>

      <View style={styles.tiles}>
        <Tile value={`+${xpAwarded}`} label={alreadyCompleted ? "XP (repeat)" : "XP earned"} />
        <Tile value={`🔥 ${streak.current}`} label={streak.extendedToday ? "Streak extended" : "Day streak"} />
        <Tile value={`${level.current}`} label={level.leveledUp ? "Level up!" : "Level"} />
      </View>

      <Text style={styles.detail}>
        Total XP: {totalXp}
        {level.nextLevelXp !== null ? ` · ${level.nextLevelXp - totalXp} XP to level ${level.current + 1}` : " · Max level"}
      </Text>
      {unlockedLessonId && <Text style={styles.unlocked}>🔓 Next lesson unlocked</Text>}
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 10, paddingTop: 24 },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  score: { fontSize: 17, color: colors.textMuted },
  tiles: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },
  tile: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 16, backgroundColor: colors.surface, gap: 4 },
  tileValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  tileLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  detail: { marginTop: 12, fontSize: 15, color: colors.textMuted, textAlign: "center" },
  unlocked: { marginTop: 4, fontSize: 16, fontWeight: "700", color: colors.success },
});
