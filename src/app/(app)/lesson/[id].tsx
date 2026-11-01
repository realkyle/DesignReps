import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CompletionSummary } from "@/components/lesson/CompletionSummary";
import { StepView } from "@/components/lesson/StepView";
import { colors } from "@/components/theme";
import { useLessonPlayer } from "@/hooks/useLessonPlayer";

/** The lesson player: steps through concept cards and questions, then shows the server's result. */
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phase, answer, next, retry } = useLessonPlayer(id);

  const session = "session" in phase ? phase.session : null;
  const close = () => router.back();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close lesson" onPress={close} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((session?.progress ?? 0) * 100)}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {phase.kind === "loading" && <ActivityIndicator style={styles.centered} />}
        {phase.kind === "error" && <Text style={styles.error}>{phase.message}</Text>}
        {phase.kind === "playing" && <StepView session={phase.session} onAnswer={answer} />}
        {phase.kind === "submitting" && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.muted}>Checking your answers…</Text>
          </View>
        )}
        {phase.kind === "submitFailed" && <Text style={styles.error}>{phase.message}</Text>}
        {phase.kind === "done" && <CompletionSummary outcome={phase.outcome} />}
      </ScrollView>

      {phase.kind === "playing" && (
        <PrimaryButton
          label={phase.session.step?.type === "question" && !phase.session.feedback ? "Pick an answer" : "Continue"}
          disabled={!phase.session.canContinue}
          onPress={next}
        />
      )}
      {phase.kind === "submitFailed" && <PrimaryButton label="Try again" onPress={retry} />}
      {(phase.kind === "done" || phase.kind === "error") && <PrimaryButton label="Back to lessons" onPress={close} />}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}
    >
      <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  close: { fontSize: 22, color: colors.textMuted, fontWeight: "600" },
  progressTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.surface, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 6, backgroundColor: colors.success },
  body: { flexGrow: 1, paddingBottom: 16 },
  centered: { marginTop: 80, alignItems: "center", gap: 12 },
  muted: { fontSize: 15, color: colors.textMuted },
  error: { marginTop: 40, fontSize: 16, color: colors.danger, textAlign: "center" },
  button: { height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  buttonDisabled: { backgroundColor: colors.surface },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  buttonTextDisabled: { color: colors.locked },
});
