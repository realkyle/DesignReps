import { useEffect } from "react";
import { AppState } from "react-native";

import { usageEvents } from "@/lib/events";

/**
 * Logs `app_opened` once when mounted (signed in) and again whenever the app
 * returns to the foreground. The server ignores repeats within 60 seconds.
 */
export function useAppOpenedEvent() {
  useEffect(() => {
    void usageEvents.appOpened();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (previous !== "active" && next === "active") void usageEvents.appOpened();
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
