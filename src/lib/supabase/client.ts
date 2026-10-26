import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import type { Database } from "./database.types";
import { SupabaseConfig } from "./SupabaseConfig";

/**
 * App-wide Supabase settings. `process.env.EXPO_PUBLIC_*` must be written out
 * in full: Expo inlines these at build time and can't see dynamic lookups.
 */
export const supabaseConfig = SupabaseConfig.fromEnv({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/**
 * The single shared Supabase client. One instance keeps one auth session and
 * one token-refresh timer for the whole app. Typed with the generated
 * `Database` schema (`npm run db:types`), so table and column names are checked.
 */
export const supabase = createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    // Persist the session on-device so users stay signed in across launches.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There are no OAuth redirects into the app (yet), so don't parse URLs for sessions.
    detectSessionInUrl: false,
  },
});

// Timers don't run reliably while a native app is backgrounded, so refresh
// tokens only while the app is in the foreground (recommended by Supabase for RN).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
