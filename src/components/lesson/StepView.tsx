import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/components/theme";
import type { LessonSession } from "@/lib/learning";

interface StepViewProps {
  session: LessonSession;
  onAnswer: (choiceId: string) => void;
}

/** Renders the current step: a concept card, or a question with its choices. */
export function StepView({ session, onAnswer }: StepViewProps) {
  const step = session.step;
  if (!step) return null;

  if (step.type === "concept") {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>Concept</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </View>
    );
  }

  const feedback = session.feedback;
  const chosen = session.answerFor(step.id);

  return (
    <View style={styles.question}>
      <Text style={styles.kicker}>Question</Text>
      <Text style={styles.prompt}>{step.prompt}</Text>
      <View style={styles.choices}>
        {step.choices.map((choice) => {
          const isCorrect = feedback && choice.id === feedback.correctChoiceId;
          const isWrongPick = feedback && choice.id === chosen && !feedback.correct;
          return (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!feedback, selected: choice.id === chosen }}
              accessibilityLabel={`${choice.text}${isCorrect ? ", correct answer" : isWrongPick ? ", your answer, incorrect" : ""}`}
              disabled={!!feedback}
              onPress={() => onAnswer(choice.id)}
              style={({ pressed }) => [
                styles.choice,
                pressed && styles.choicePressed,
                isCorrect && styles.choiceCorrect,
                isWrongPick && styles.choiceWrong,
              ]}
            >
              <Text style={styles.choiceText}>{choice.text}</Text>
              {isCorrect && <Text style={[styles.mark, { color: colors.success }]}>✓</Text>}
              {isWrongPick && <Text style={[styles.mark, { color: colors.danger }]}>✕</Text>}
            </Pressable>
          );
        })}
      </View>

      {feedback && (
        <View style={[styles.feedback, feedback.correct ? styles.feedbackRight : styles.feedbackWrong]} accessibilityLiveRegion="polite">
          <Text style={[styles.feedbackTitle, { color: feedback.correct ? colors.success : colors.danger }]}>
            {feedback.correct ? "Correct!" : "Not quite"}
          </Text>
          <Text style={styles.body}>{feedback.explanation}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 18, backgroundColor: colors.primarySoft, gap: 10 },
  question: { gap: 12 },
  kicker: { fontSize: 13, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  prompt: { fontSize: 20, fontWeight: "700", lineHeight: 28, color: colors.text },
  choices: { gap: 10, marginTop: 4 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  choicePressed: { borderColor: colors.primary },
  choiceCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  choiceWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  choiceText: { flex: 1, fontSize: 16, color: colors.text },
  mark: { fontSize: 18, fontWeight: "800" },
  feedback: { padding: 16, borderRadius: 14, gap: 6, marginTop: 4 },
  feedbackRight: { backgroundColor: colors.successSoft },
  feedbackWrong: { backgroundColor: colors.dangerSoft },
  feedbackTitle: { fontSize: 17, fontWeight: "800" },
});
