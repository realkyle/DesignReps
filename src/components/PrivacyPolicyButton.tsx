import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/components/theme";
import { privacyPolicyLink } from "@/lib/legal";

/** A "Privacy policy" text button that opens the public policy in an in-app browser. */
export function PrivacyPolicyButton() {
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    const result = await privacyPolicyLink.open();
    if (!result.ok) setError(result.message);
  }

  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="link" accessibilityHint="Opens the privacy policy in a browser" onPress={open} style={styles.button}>
        <Text style={styles.text}>Privacy policy</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  button: { padding: 12 },
  text: { color: colors.textMuted, fontSize: 14, textDecorationLine: "underline" },
  error: { fontSize: 14, color: colors.danger, textAlign: "center" },
});
