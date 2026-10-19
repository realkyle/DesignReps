import { StyleSheet, Text, View } from "react-native";

import { type ConnectionState, useSupabaseConnection } from "@/hooks/useSupabaseConnection";

export default function Index() {
  const connection = useSupabaseConnection();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DesignReps</Text>
      <Text style={styles.tagline}>Show up daily. Design better.</Text>
      {/* Temporary Week 2 check; replaced by the login screen in Week 3. */}
      <Text style={styles.status}>{describe(connection)}</Text>
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
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  tagline: {
    fontSize: 16,
    opacity: 0.7,
  },
  status: {
    marginTop: 16,
    fontSize: 14,
    textAlign: "center",
  },
});
