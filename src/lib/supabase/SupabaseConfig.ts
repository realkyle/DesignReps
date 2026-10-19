/**
 * Raw environment values as Expo inlines them at build time. Either may be
 * missing if `.env` (local) or EAS env vars (cloud builds) aren't set up.
 */
export interface SupabaseEnv {
  url: string | undefined;
  publishableKey: string | undefined;
}

/** Thrown when the Supabase settings are missing or unsafe to ship in the app. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/**
 * Validated, immutable Supabase connection settings.
 *
 * Validation lives here (not in the client module) so a bad setup fails fast
 * with a readable message instead of as an opaque network error later, and so
 * it can be unit tested without touching the network or real env vars.
 */
export class SupabaseConfig {
  private constructor(
    private readonly projectUrl: string,
    private readonly key: string,
  ) {}

  /**
   * Builds a config from env values, rejecting anything missing, malformed,
   * or privileged.
   *
   * @throws {SupabaseConfigError} if a value is missing, the URL isn't https,
   *   or the key is a secret/service_role key that must never ship in an app.
   */
  static fromEnv(env: SupabaseEnv): SupabaseConfig {
    const url = SupabaseConfig.require(env.url, "EXPO_PUBLIC_SUPABASE_URL");
    const key = SupabaseConfig.require(
      env.publishableKey,
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
    SupabaseConfig.assertHttpsUrl(url);
    SupabaseConfig.assertClientSafeKey(key);
    return new SupabaseConfig(url.replace(/\/+$/, ""), key);
  }

  /** Project base URL without a trailing slash, e.g. `https://abc.supabase.co`. */
  get url(): string {
    return this.projectUrl;
  }

  /** Publishable (or legacy anon) key; public by design, protected by RLS. */
  get publishableKey(): string {
    return this.key;
  }

  private static require(value: string | undefined, name: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new SupabaseConfigError(
        `${name} is not set. Add it to .env (local) or EAS env vars (builds), then restart Expo with -c.`,
      );
    }
    return trimmed;
  }

  private static assertHttpsUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new SupabaseConfigError("EXPO_PUBLIC_SUPABASE_URL is not a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new SupabaseConfigError("EXPO_PUBLIC_SUPABASE_URL must use https.");
    }
  }

  /**
   * Everything prefixed EXPO_PUBLIC_ is bundled into the app, so a privileged
   * key here would let anyone bypass Row Level Security. Catch that mistake
   * before it can ship.
   */
  private static assertClientSafeKey(key: string): void {
    const privileged =
      key.startsWith("sb_secret_") || SupabaseConfig.legacyJwtRole(key) === "service_role";
    if (privileged) {
      throw new SupabaseConfigError(
        "A secret/service_role key was supplied. Use the publishable (or anon) key; secret keys belong only in Edge Function secrets.",
      );
    }
  }

  /** Reads the `role` claim from a legacy JWT key; undefined for non-JWT keys. */
  private static legacyJwtRole(key: string): string | undefined {
    const parts = key.split(".");
    if (parts.length !== 3) return undefined;
    try {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64)).role;
    } catch {
      return undefined;
    }
  }
}
