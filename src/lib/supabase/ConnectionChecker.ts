import type { SupabaseConfig } from "./SupabaseConfig";

/** Outcome of a reachability check, shaped for direct display in the UI. */
export type ConnectionResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: string };

/**
 * Verifies the app can reach the Supabase project with its configured key.
 *
 * Calls the Auth health endpoint rather than `auth.getSession()`, because
 * getSession only reads local storage and would report success while offline
 * or with a wrong key. `fetch` and the clock are injected so tests stay off the network.
 */
export class ConnectionChecker {
  constructor(
    private readonly config: SupabaseConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Never throws: network and HTTP failures are returned as `{ ok: false }`. */
  async check(): Promise<ConnectionResult> {
    const startedAt = this.now();
    try {
      const response = await this.fetchFn(`${this.config.url}/auth/v1/health`, {
        headers: { apikey: this.config.publishableKey },
      });
      if (!response.ok) {
        return { ok: false, reason: ConnectionChecker.describeStatus(response.status) };
      }
      return { ok: true, latencyMs: this.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `Network error: ${message}` };
    }
  }

  private static describeStatus(status: number): string {
    if (status === 401 || status === 403) {
      return `Key rejected (HTTP ${status}). Check EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.`;
    }
    return `Supabase responded with HTTP ${status}.`;
  }
}
