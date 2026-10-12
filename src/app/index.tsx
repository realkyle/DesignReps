import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>DesignReps</Text>
      <Text style={styles.tagline}>Show up daily. Design better.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  tagline: {
    fontSize: 16,
    opacity: 0.7,
  },
});
