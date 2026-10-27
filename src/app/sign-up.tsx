import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { AuthForm, type AuthFormOutcome } from "@/components/AuthForm";
import { authService, Credentials } from "@/lib/auth";

async function signUp(email: string, password: string): Promise<AuthFormOutcome> {
  const result = await authService.signUp(email, password);
  if (result.ok && result.status === "signed_in") return { kind: "done" };
  if (result.ok) {
    return {
      kind: "message",
      tone: "info",
      text: "Check your email for a confirmation link, then come back and sign in.",
    };
  }
  if ("fieldErrors" in result) return { kind: "fieldErrors", errors: result.fieldErrors };
  return { kind: "message", text: result.failure.message, tone: "error" };
}

export default function SignUpScreen() {
  return (
    <AuthForm
      title="Create account"
      submitLabel="Create account"
      passwordHint="Create a strong password"
      passwordHelp={Credentials.describePasswordRules()}
      onSubmit={signUp}
      footer={
        <Link href="/sign-in" replace style={styles.link}>
          <Text>Already have an account? Sign in</Text>
        </Link>
      }
    />
  );
}

const styles = StyleSheet.create({
  link: { textAlign: "center", color: "#1D4ED8", fontSize: 16, fontWeight: "600", paddingVertical: 12 },
});
