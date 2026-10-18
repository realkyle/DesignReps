import { SupabaseConfig, SupabaseConfigError } from "../SupabaseConfig";

const VALID_URL = "https://abcdefghij.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_test123";

/** Builds an unsigned JWT-shaped key with the given role, like Supabase's legacy keys. */
function legacyKey(role: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
}

describe("SupabaseConfig.fromEnv", () => {
  it("accepts a publishable key and https URL", () => {
    const config = SupabaseConfig.fromEnv({ url: VALID_URL, publishableKey: PUBLISHABLE_KEY });
    expect(config.url).toBe(VALID_URL);
    expect(config.publishableKey).toBe(PUBLISHABLE_KEY);
  });

  it("accepts a legacy anon JWT key", () => {
    const key = legacyKey("anon");
    expect(SupabaseConfig.fromEnv({ url: VALID_URL, publishableKey: key }).publishableKey).toBe(key);
  });

  it("trims whitespace and trailing slashes", () => {
    const config = SupabaseConfig.fromEnv({
      url: `  ${VALID_URL}// `,
      publishableKey: ` ${PUBLISHABLE_KEY} `,
    });
    expect(config.url).toBe(VALID_URL);
    expect(config.publishableKey).toBe(PUBLISHABLE_KEY);
  });

  it.each([
    ["url", { url: undefined, publishableKey: PUBLISHABLE_KEY }, /EXPO_PUBLIC_SUPABASE_URL is not set/],
    ["blank url", { url: "   ", publishableKey: PUBLISHABLE_KEY }, /EXPO_PUBLIC_SUPABASE_URL is not set/],
    ["key", { url: VALID_URL, publishableKey: undefined }, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set/],
  ])("rejects a missing %s", (_label, env, message) => {
    expect(() => SupabaseConfig.fromEnv(env)).toThrow(message);
  });

  it("rejects a malformed URL", () => {
    expect(() => SupabaseConfig.fromEnv({ url: "not a url", publishableKey: PUBLISHABLE_KEY })).toThrow(
      /not a valid URL/,
    );
  });

  it("rejects a non-https URL", () => {
    expect(() =>
      SupabaseConfig.fromEnv({ url: "http://abcdefghij.supabase.co", publishableKey: PUBLISHABLE_KEY }),
    ).toThrow(/must use https/);
  });

  it.each([
    ["new-style secret key", "sb_secret_abc123"],
    ["legacy service_role JWT", legacyKey("service_role")],
  ])("refuses a %s so it can never ship in the app", (_label, key) => {
    expect(() => SupabaseConfig.fromEnv({ url: VALID_URL, publishableKey: key })).toThrow(
      SupabaseConfigError,
    );
  });
});
