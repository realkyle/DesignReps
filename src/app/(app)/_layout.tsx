import { Stack } from "expo-router";

/** Screens for signed-in users. The root layout guards this whole group. */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
