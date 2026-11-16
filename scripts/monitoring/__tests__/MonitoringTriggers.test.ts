import { type MonitoringConfig, MonitoringTriggers } from "../MonitoringTriggers";

const CONFIG: MonitoringConfig = {
  url: "https://example.supabase.co/",
  publishableKey: "sb_publishable_test",
  testEmail: "someone+monitor@example.com",
  testPassword: "right-password",
};

type Call = { url: string; headers: Record<string, string>; body: unknown };

/** A fake Supabase that answers like production does for each trigger. */
function fakeSupabase(overrides: { signInStatus?: number } = {}) {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, headers: init.headers, body });
    const reply = (status: number, json: unknown) => ({ status, text: async (): Promise<string> => JSON.stringify(json) });

    if (url.endsWith("/auth/v1/token?grant_type=password")) {
      if (body.password !== CONFIG.testPassword) return reply(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      const status = overrides.signInStatus ?? 200;
      return status === 200 ? reply(200, { access_token: "test-token" }) : reply(status, { code: status });
    }
    if (url.endsWith("/rest/v1/rpc/log_event")) return reply(400, { code: "22023", message: "log_event: type must be..." });
    const authed = init.headers.Authorization === "Bearer test-token";
    if (!authed) return reply(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    if (url.endsWith("/functions/v1/complete-lesson")) return reply(404, { error: { code: "LESSON_NOT_FOUND", message: "..." } });
    if (url.endsWith("/functions/v1/delete-account")) return reply(204, null);
    return reply(500, {});
  });
  return { fetch, calls };
}

describe("MonitoringTriggers.of", () => {
  it.each([
    ["url", "EXPO_PUBLIC_SUPABASE_URL"],
    ["publishableKey", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ["testEmail", "MONITOR_TEST_EMAIL"],
    ["testPassword", "MONITOR_TEST_PASSWORD"],
  ] as const)("names the missing variable when %s is missing (never the values)", (key, envName) => {
    const config = { ...CONFIG, [key]: undefined };
    expect(() => MonitoringTriggers.of(config, jest.fn())).toThrow(`Set ${envName}`);
    try {
      MonitoringTriggers.of(config, jest.fn());
    } catch (error) {
      expect(String(error)).not.toContain(CONFIG.testPassword);
      expect(String(error)).not.toContain(CONFIG.publishableKey);
    }
  });

  it.each(["http://example.com", "http://127.0.0.1.evil.com", "ftp://127.0.0.1"])("refuses the non-https URL %s", (url) => {
    expect(() => MonitoringTriggers.of({ ...CONFIG, url }, jest.fn())).toThrow("https://");
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321/"])("allows the local stack at %s", (url) => {
    expect(() => MonitoringTriggers.of({ ...CONFIG, url }, jest.fn())).not.toThrow();
  });

  it("refuses an account that isn't the +monitor test account", () => {
    expect(() => MonitoringTriggers.of({ ...CONFIG, testEmail: "real.user@example.com" }, jest.fn())).toThrow("+monitor");
  });
});

describe("MonitoringTriggers.runAll", () => {
  it("runs the five triggers and each gets its expected status and code", async () => {
    const { fetch } = fakeSupabase();
    const results = await MonitoringTriggers.of(CONFIG, fetch).runAll();

    expect(results.map((r) => [r.id, r.actualStatus, r.code, r.ok])).toEqual([
      [1, 400, "invalid_credentials", true],
      [2, 400, "22023", true],
      [3, 401, "UNAUTHENTICATED", true],
      [4, 404, "LESSON_NOT_FOUND", true],
      [5, 401, "UNAUTHENTICATED", true],
    ]);
  });

  it("never sends a token to delete-account", async () => {
    const { fetch, calls } = fakeSupabase();
    await MonitoringTriggers.of(CONFIG, fetch).runAll();

    const deleteCalls = calls.filter((c) => c.url.includes("/functions/v1/delete-account"));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].headers).not.toHaveProperty("Authorization");
  });

  it("sends the token only to log_event and the unknown-lesson call", async () => {
    const { fetch, calls } = fakeSupabase();
    await MonitoringTriggers.of(CONFIG, fetch).runAll();

    const withToken = calls.filter((c) => c.headers.Authorization).map((c) => c.url.replace(CONFIG.url, "/").replace("//", "/"));
    expect(withToken).toEqual(["/rest/v1/rpc/log_event", "/functions/v1/complete-lesson"]);
  });

  it("uses an unknown lesson ID so complete-lesson can't write anything", async () => {
    const { fetch, calls } = fakeSupabase();
    await MonitoringTriggers.of(CONFIG, fetch).runAll();

    const lessonCall = calls.find((c) => c.url.endsWith("/complete-lesson") && c.headers.Authorization);
    expect(lessonCall?.body).toMatchObject({ lessonId: "00000000-0000-0000-0000-000000000000" });
  });

  it("sends the publishable key and strips the URL's trailing slash", async () => {
    const { fetch, calls } = fakeSupabase();
    await MonitoringTriggers.of(CONFIG, fetch).runAll();

    for (const call of calls) {
      expect(call.headers.apikey).toBe(CONFIG.publishableKey);
      expect(call.url.startsWith("https://example.supabase.co/")).toBe(true);
      expect(call.url).not.toContain(".co//");
    }
  });

  it("marks a trigger as failed when the status is unexpected", async () => {
    const { fetch } = fakeSupabase();
    const wrapped = jest.fn(async (url: string, init: Parameters<typeof fetch>[1]) =>
      url.endsWith("/functions/v1/delete-account") ? { status: 500, text: async (): Promise<string> => "{}" } : fetch(url, init),
    );
    const results = await MonitoringTriggers.of(CONFIG, wrapped).runAll();
    expect(results.find((r) => r.id === 5)?.ok).toBe(false);
  });

  it("stops with a clear error if the test account can't sign in", async () => {
    const { fetch } = fakeSupabase({ signInStatus: 400 });
    await expect(MonitoringTriggers.of(CONFIG, fetch).runAll()).rejects.toThrow("Test account sign-in failed (HTTP 400)");
  });
});
