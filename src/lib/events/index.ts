import { supabase } from "@/lib/supabase";

import { UsageEvents } from "./UsageEvents";

export { type ClientEventType, type LogEventRpc, UsageEvents } from "./UsageEvents";

/** App-wide usage events, backed by the shared Supabase client. */
export const usageEvents = new UsageEvents((fn, args) => supabase.rpc(fn, args));
