import { type BenchmarkConfig, CompleteLessonBenchmark } from "../CompleteLessonBenchmark";

const CONFIG: BenchmarkConfig = {
  url: "https://example.supabase.co/",
  publishableKey: "sb_publishable_test",
  testEmail: "someone+monitor@example.com",
  testPassword: "right-password",
};

const LESSON = {
  id: "11111111-1111-1111-1111-111111111111",
  content: {
    steps: [
      { type: "concept", id: "c1" },
      { type: "question", id: "q1", choices: [{ id: "a" }, { id: "b" }] },
      { type: "question", id: "q2", choices: [{ id: "c" }] },
    ],
  },
};

type Init = { method: string; headers: Record<string, string>; body?: string };

/**
 * A fake Supabase plus a fake clock: each complete-lesson call "takes" the
 * next duration in `durations`, so the percentiles are known in advance.
 */
function fakeSupabase(durations: number[], options: { completeStatus?: (call: number) => number; signInStatus?: number } = {}) {
  let clock = 0;
  let completeCalls = 0;
  const requests: { url: string; init: Init }[] = [];
  const reply = (status: number, json: unknown) => ({ status, text: async (): Promise<string> => JSON.stringify(json) });

  const fetch = jest.fn(async (url: string, init: Init) => {
    requests.push({ url, init });
    if (url.endsWith("/auth/v1/token?grant_type=password")) {
      const status = options.signInStatus ?? 200;
      return status === 200 ? reply(200, { access_token: "test-token" }) : reply(status, {});
    }
    if (url.includes("/rest/v1/lessons?")) return reply(200, [LESSON]);
    if (url.endsWith("/functions/v1/complete-lesson")) {
      clock += durations[completeCalls] ?? 1;
      const status = options.completeStatus?.(completeCalls) ?? 200;
      completeCalls++;
      return reply(status, {});
    }
    return reply(500, {});
  });
  return { fetch, now: () => clock, requests };
}

describe("CompleteLessonBenchmark.of", () => {
  it.each([
    ["url", "EXPO_PUBLIC_SUPABASE_URL"],
    ["publishableKey", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ["testEmail", "MONITOR_TEST_EMAIL"],
    ["testPassword", "MONITOR_TEST_PASSWORD"],
  ] as const)("names %s's variable when it is missing, without printing values", (key, envName) => {
    const { fetch, now } = fakeSupabase([]);
    const config = { ...CONFIG, [key]: undefined };
    expect(() => CompleteLessonBenchmark.of(config, fetch, now)).toThrow(`Set ${envName} in your shell first.`);
  });

  it("refuses an account that is not the +monitor test account", () => {
    const { fetch, now } = fakeSupabase([]);
    expect(() => CompleteLessonBenchmark.of({ ...CONFIG, testEmail: "real.user@example.com" }, fetch, now)).toThrow(/\+monitor/);
  });

  it("refuses a plain-http remote URL", () => {
    const { fetch, now } = fakeSupabase([]);
    expect(() => CompleteLessonBenchmark.of({ ...CONFIG, url: "http://example.supabase.co" }, fetch, now)).toThrow(/https/);
  });
});

describe("CompleteLessonBenchmark.percentile", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => 20 - i); // 20..1, unsorted on purpose

  it("uses nearest rank", () => {
    expect(CompleteLessonBenchmark.percentile(twenty, 50)).toBe(10);
    expect(CompleteLessonBenchmark.percentile(twenty, 95)).toBe(19);
    expect(CompleteLessonBenchmark.percentile(twenty, 100)).toBe(20);
  });

  it("returns the only sample, and rejects an empty list", () => {
    expect(CompleteLessonBenchmark.percentile([7], 95)).toBe(7);
    expect(() => CompleteLessonBenchmark.percentile([], 50)).toThrow("No samples.");
  });
});

describe("CompleteLessonBenchmark.run", () => {
  it("leaves warm-ups out of the percentiles and reports the first call separately", async () => {
    // 2 warm-ups (900 ms cold start, then 300), then 20 measured calls of 101..120 ms.
    const durations = [900, 300, ...Array.from({ length: 20 }, (_, i) => 101 + i)];
    const { fetch, now } = fakeSupabase(durations);

    const report = await CompleteLessonBenchmark.of(CONFIG, fetch, now).run({ warmupRuns: 2, measuredRuns: 20 });

    expect(report).toEqual({
      lessonId: LESSON.id,
      firstCallMs: 900,
      measuredRuns: 20,
      p50Ms: 110,
      p95Ms: 119,
      maxMs: 120,
      failures: 0,
    });
  });

  it("sends the first lesson with one first-choice answer per question, signed in, to the trimmed URL", async () => {
    const { fetch, now, requests } = fakeSupabase([]);
    await CompleteLessonBenchmark.of(CONFIG, fetch, now).run({ warmupRuns: 1, measuredRuns: 1 });

    const completes = requests.filter((r) => r.url === "https://example.supabase.co/functions/v1/complete-lesson");
    expect(completes).toHaveLength(2);
    expect(completes[0].init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(completes[0].init.body!)).toEqual({
      lessonId: LESSON.id,
      answers: [
        { questionId: "q1", choiceId: "a" },
        { questionId: "q2", choiceId: "c" },
      ],
      timezone: "UTC",
    });
  });

  it("counts measured calls that don't return 200 as failures", async () => {
    const { fetch, now } = fakeSupabase([], { completeStatus: (call) => (call === 3 ? 500 : 200) });
    const report = await CompleteLessonBenchmark.of(CONFIG, fetch, now).run({ warmupRuns: 1, measuredRuns: 5 });
    expect(report.failures).toBe(1);
  });

  it("stops when a warm-up call fails, so a broken setup is never timed", async () => {
    const { fetch, now } = fakeSupabase([], { completeStatus: () => 403 });
    await expect(CompleteLessonBenchmark.of(CONFIG, fetch, now).run({ warmupRuns: 1, measuredRuns: 5 })).rejects.toThrow("HTTP 403");
  });

  it("stops with the HTTP status when sign-in fails", async () => {
    const { fetch, now } = fakeSupabase([], { signInStatus: 400 });
    await expect(CompleteLessonBenchmark.of(CONFIG, fetch, now).run({ warmupRuns: 1, measuredRuns: 1 })).rejects.toThrow("HTTP 400");
  });
});
