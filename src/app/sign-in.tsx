import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { AuthForm, type AuthFormOutcome } from "@/components/AuthForm";
import { authService } from "@/lib/auth";

async function signIn(email: string, password: string): Promise<AuthFormOutcome> {
  const result = await authService.signIn(email, password);
  if (result.ok) return { kind: "done" }; // the root layout redirects on the new session
  if ("fieldErrors" in result) return { kind: "fieldErrors", errors: result.fieldErrors };
  return { kind: "message", text: result.failure.message, tone: "error" };
}

export default function SignInScreen() {
  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={signIn}
      footer={
        <Link href="/sign-up" replace style={styles.link}>
          <Text>New here? Create an account</Text>
        </Link>
      }
    />
  );
}

const styles = StyleSheet.create({
  link: { textAlign: "center", color: "#1D4ED8", fontSize: 16, fontWeight: "600", paddingVertical: 12 },
});
