import { useEffect, useState } from "react";

import { ConnectionChecker, type ConnectionResult, supabaseConfig } from "@/lib/supabase";

/** `undefined` while the check is in flight. */
export type ConnectionState = ConnectionResult | undefined;

/** Runs one Supabase reachability check when the calling screen mounts. */
export function useSupabaseConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(undefined);

  useEffect(() => {
    let cancelled = false;
    new ConnectionChecker(supabaseConfig).check().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
