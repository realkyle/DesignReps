import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { CredentialErrors } from "@/lib/auth";

/** What a submit produced, so the form can show field errors or a banner message. */
export type AuthFormOutcome =
  | { kind: "done" }
  | { kind: "fieldErrors"; errors: CredentialErrors }
  | { kind: "message"; text: string; tone: "error" | "info" };

interface AuthFormProps {
  title: string;
  submitLabel: string;
  passwordHint?: string;
  onSubmit: (email: string, password: string) => Promise<AuthFormOutcome>;
  /** Secondary action below the form, e.g. "Create account". */
  footer?: React.ReactNode;
}

/** Shared email/password form for the sign-in and sign-up screens. */
export function AuthForm({ title, submitLabel, passwordHint, onSubmit, footer }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [banner, setBanner] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setBanner(null);
    setFieldErrors({});
    const outcome = await onSubmit(email, password);
    setSubmitting(false);
    if (outcome.kind === "fieldErrors") setFieldErrors(outcome.errors);
    if (outcome.kind === "message") setBanner({ text: outcome.text, tone: outcome.tone });
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Text style={styles.brand}>DesignReps</Text>
        <Text style={styles.tagline}>Show up daily. Design better.</Text>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      {banner && (
        <Text style={[styles.banner, banner.tone === "error" ? styles.bannerError : styles.bannerInfo]}>
          {banner.text}
        </Text>
      )}

      <View style={styles.field}>
        <Text style={styles.label} nativeID="email-label">
          Email
        </Text>
        <TextInput
          accessibilityLabelledBy="email-label"
          style={[styles.input, fieldErrors.email && styles.inputError]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!submitting}
        />
        {fieldErrors.email && <Text style={styles.errorText}>{fieldErrors.email}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label} nativeID="password-label">
          Password
        </Text>
        <TextInput
          accessibilityLabelledBy="password-label"
          style={[styles.input, fieldErrors.password && styles.inputError]}
          value={password}
          onChangeText={setPassword}
          placeholder={passwordHint}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          editable={!submitting}
          onSubmitEditing={handleSubmit}
        />
        {fieldErrors.password && <Text style={styles.errorText}>{fieldErrors.password}</Text>}
      </View>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, (pressed || submitting) && styles.primaryPressed]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{submitLabel}</Text>}
      </Pressable>

      {footer}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, paddingTop: 96, gap: 16, backgroundColor: "#FFFFFF" },
  header: { alignItems: "center", gap: 6, marginBottom: 8 },
  brand: { fontSize: 32, fontWeight: "700", color: "#111827" },
  tagline: { fontSize: 16, color: "#4B5563" },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  banner: { padding: 12, borderRadius: 12, fontSize: 14, overflow: "hidden" },
  bannerError: { backgroundColor: "#FEF2F2", color: "#991B1B" },
  bannerInfo: { backgroundColor: "#EFF6FF", color: "#1E3A8A" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    fontSize: 16,
    color: "#111827",
  },
  inputError: { borderColor: "#B91C1C" },
  errorText: { fontSize: 13, color: "#B91C1C" },
  primary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryPressed: { opacity: 0.8 },
  primaryText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
