import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/components/theme";
import { AccountDeletionClient, accountDeletion, DELETE_CONFIRMATION_WORD } from "@/lib/auth";

/**
 * Delete account (App Store requirement). Explains what is deleted and asks
 * the user to type DELETE first. On success the session is cleared, and the
 * root layout's guard sends the user back to sign-in.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = AccountDeletionClient.isConfirmed(typed);

  async function onDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    const result = await accountDeletion.deleteAccount();
    // On success the screen unmounts as the app returns to sign-in.
    if (!result.ok) {
      setError(result.message);
      setDeleting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back} disabled={deleting}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Delete account</Text>
        <Text style={styles.body}>This permanently deletes:</Text>
        <Text style={styles.body}>• your sign-in (email and password){"\n"}• your XP, level and streak{"\n"}• your lesson progress and activity history</Text>
        <Text style={[styles.body, styles.warning]}>This can&apos;t be undone.</Text>

        <Text style={styles.label}>Type {DELETE_CONFIRMATION_WORD} to confirm</Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleting}
          accessibilityLabel={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
          style={styles.input}
        />

        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !confirmed || deleting }}
          disabled={!confirmed || deleting}
          onPress={onDelete}
          style={[styles.deleteButton, (!confirmed || deleting) && styles.deleteButtonDisabled]}
        >
          {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteText}>Delete my account</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, gap: 12 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  warning: { fontWeight: "700", color: colors.danger },
  label: { marginTop: 12, fontSize: 15, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  error: { fontSize: 15, color: colors.danger },
  deleteButton: {
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.danger,
  },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
