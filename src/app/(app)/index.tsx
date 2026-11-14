import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrivacyPolicyButton } from "@/components/PrivacyPolicyButton";
import { colors } from "@/components/theme";
import { useLessonPath } from "@/hooks/useLessonPath";
import { authService } from "@/lib/auth";
import type { PathItem } from "@/lib/learning";

/** Home: the player's stats (tap for the progress screen) and the lesson path (completed ✓, open, locked). */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { path, player, error, isLoading, reload } = useLessonPath();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={isLoading && path !== null} onRefresh={reload} />}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>DesignReps</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            player
              ? `Your progress: ${player.streak.current}-day streak, ${player.level.xp} XP, level ${player.level.level}`
              : "Your progress"
          }
          accessibilityHint="Opens your progress"
          onPress={() => router.push("/progress")}
          style={({ pressed }) => [styles.stats, pressed && styles.rowPressed]}
        >
          <Stat label="Streak" value={player ? `${player.streak.current}` : "–"} />
          <Stat label="XP" value={player ? `${player.level.xp}` : "–"} />
          <Stat label="Level" value={player ? `${player.level.level}` : "–"} />
          <Text style={styles.statsChevron}>›</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!path && !error && <Text style={styles.muted}>Loading your lessons…</Text>}

      {path && (
        <>
          <Text style={styles.trackTitle}>{path.trackTitle}</Text>
          <Text style={styles.muted}>
            {path.completedCount} of {path.items.length} complete
          </Text>
          <View style={styles.path}>
            {path.items.map((item) => (
              <LessonRow
                key={item.id}
                item={item}
                isNext={item.id === path.nextLesson?.id}
                onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: item.id } })}
              />
            ))}
          </View>
        </>
      )}

      <Pressable accessibilityRole="button" onPress={() => authService.signOut()} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/delete-account")} style={styles.deleteAccount}>
        <Text style={styles.deleteAccountText}>Delete account</Text>
      </Pressable>
      <PrivacyPolicyButton />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LessonRow({ item, isNext, onPress }: { item: PathItem; isNext: boolean; onPress: () => void }) {
  const locked = item.status === "locked";
  const done = item.status === "completed";
  const badge = done ? "✓" : String(item.position);
  const subtitle = item.kind === "scenario" ? "Scenario · 25 XP" : "Lesson · 10 XP";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={`${item.title}, ${done ? "completed" : locked ? "locked" : "open"}`}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isNext && styles.rowNext,
        locked && styles.rowLocked,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.badge, done && styles.badgeDone, isNext && styles.badgeNext, locked && styles.badgeLocked]}>
        <Text style={[styles.badgeText, (done || isNext) && styles.badgeTextLight, locked && styles.lockedText]}>{badge}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, locked && styles.lockedText]}>{item.title}</Text>
        <Text style={[styles.rowSubtitle, locked && styles.lockedText]}>
          {done ? "Completed · practice again" : locked ? "Finish the previous lesson to unlock" : subtitle}
        </Text>
      </View>
      {isNext && <Text style={styles.start}>Start</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, gap: 8 },
  header: { gap: 16, marginBottom: 16 },
  brand: { fontSize: 28, fontWeight: "800", color: colors.text },
  stats: { flexDirection: "row", alignItems: "center", gap: 12 },
  statsChevron: { fontSize: 28, fontWeight: "600", color: colors.textMuted },
  stat: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  trackTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  error: { fontSize: 15, color: colors.danger },
  path: { gap: 12, marginTop: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rowNext: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowLocked: { backgroundColor: colors.surface },
  rowPressed: { opacity: 0.75 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  badgeDone: { backgroundColor: colors.success, borderColor: colors.success },
  badgeNext: { backgroundColor: colors.primary, borderColor: colors.primary },
  badgeLocked: { backgroundColor: colors.background },
  badgeText: { fontSize: 18, fontWeight: "800", color: colors.text },
  badgeTextLight: { color: "#FFFFFF" },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.textMuted },
  lockedText: { color: colors.locked },
  start: { fontSize: 15, fontWeight: "800", color: colors.primary },
  signOut: { marginTop: 32, alignSelf: "center", padding: 12 },
  signOutText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  deleteAccount: { alignSelf: "center", padding: 12 },
  deleteAccountText: { color: colors.textMuted, fontSize: 14 },
});
