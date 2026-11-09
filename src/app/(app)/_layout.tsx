import { Stack } from "expo-router";

import { useAppOpenedEvent } from "@/hooks/useAppOpenedEvent";

/** Screens for signed-in users. The root layout guards this whole group. */
export default function AppLayout() {
  useAppOpenedEvent();
  return <Stack screenOptions={{ headerShown: false }} />;
}
