import type { Session } from "@supabase/supabase-js";
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";

import { authService } from "@/lib/auth";

interface SessionState {
  /** The signed-in user's session, or null when signed out. */
  session: Session | null;
  /** True until the stored session has been read from the device. */
  isLoading: boolean;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

/**
 * Makes the current session available to every screen and keeps it in sync
 * with Supabase (sign-in, sign-out, token refresh).
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    let active = true;
    authService.currentSession().then((session) => {
      if (active) setState({ session, isLoading: false });
    });
    const unsubscribe = authService.onSessionChange((session) => {
      if (active) setState({ session, isLoading: false });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

/** Reads the session. Must be used inside `<SessionProvider>`. */
export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
