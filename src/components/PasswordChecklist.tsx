import { StyleSheet, Text, View } from "react-native";

import { Credentials } from "@/lib/auth";

interface PasswordChecklistProps {
  password: string;
}

/**
 * Live list of password requirements under the sign-up password field.
 * Each rule shows orange ✕ until met, then green ✓. The icon changes along
 * with the color, so it works without color vision and for screen readers.
 */
export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const rules = Credentials.checkPassword(password);

  return (
    <View accessibilityLabel="Password requirements" style={styles.list}>
      {rules.map((rule) => (
        <View
          key={rule.description}
          style={styles.row}
          accessible
          accessibilityLabel={`${rule.description}: ${rule.met ? "met" : "not met"}`}
        >
          <Text style={[styles.icon, rule.met ? styles.met : styles.unmet]} aria-hidden>
            {rule.met ? "✓" : "✕"}
          </Text>
          <Text style={[styles.text, rule.met ? styles.met : styles.unmet]}>{capitalize(rule.description)}</Text>
        </View>
      ))}
    </View>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  list: { gap: 4, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 16, fontSize: 14, fontWeight: "700", textAlign: "center" },
  text: { fontSize: 14 },
  // Both colors pass 4.5:1 contrast on white.
  unmet: { color: "#C2410C" },
  met: { color: "#15803D" },
});
