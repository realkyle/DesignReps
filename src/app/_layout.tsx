import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";

import { SessionProvider, useSession } from "@/providers/SessionProvider";

// Keep the splash screen up until we know whether someone is signed in,
// so the sign-in screen never flashes for a user who already is.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

/**
 * Route guards: signed-in users can reach the (app) group, and signed-out
 * users can only reach sign-in and sign-up. When the session changes, Expo
 * Router redirects automatically.
 */
function RootNavigator() {
  const { session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );
}
