import { Pressable, StyleSheet, Text, View } from "react-native";

import { type ConnectionState, useSupabaseConnection } from "@/hooks/useSupabaseConnection";
import { authService } from "@/lib/auth";
import { useSession } from "@/providers/SessionProvider";

/** Temporary signed-in home; becomes the lesson path once the lesson engine exists. */
export default function HomeScreen() {
  const { session } = useSession();
  const connection = useSupabaseConnection();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DesignReps</Text>
      <Text style={styles.tagline}>Show up daily. Design better.</Text>
      <Text style={styles.signedIn}>Signed in as {session?.user.email}</Text>
      <Text style={styles.status}>{describe(connection)}</Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        onPress={() => authService.signOut()}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function describe(connection: ConnectionState): string {
  if (!connection) return "Checking Supabase…";
  if (connection.ok) return `✅ Supabase connected (${connection.latencyMs} ms)`;
  return `❌ ${connection.reason}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 32, fontWeight: "700" },
  tagline: { fontSize: 16, color: "#4B5563" },
  signedIn: { marginTop: 24, fontSize: 16, fontWeight: "600", color: "#111827" },
  status: { fontSize: 14, textAlign: "center", color: "#374151" },
  signOut: {
    marginTop: 24,
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#1D4ED8",
    justifyContent: "center",
  },
  signOutPressed: { opacity: 0.7 },
  signOutText: { color: "#1D4ED8", fontSize: 16, fontWeight: "700" },
});
