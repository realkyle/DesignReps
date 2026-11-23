/** Settings for a benchmark run. Read from the shell's environment by the entry script. */
export interface BenchmarkConfig {
  /** Project URL, e.g. https://<ref>.supabase.co */
  url: string;
  /** The publishable key (public; the same one the app ships). */
  publishableKey: string;
  /** The dedicated +monitor test account, never a real user's. */
  testEmail: string;
  testPassword: string;
}

/** How many calls to make. Warm-up calls are timed but left out of the percentiles. */
export interface BenchmarkPlan {
  warmupRuns: number;
  measuredRuns: number;
}

/** Latency summary of one run, in milliseconds. */
export interface BenchmarkReport {
  lessonId: string;
  /** The very first call, which may include an Edge Function cold start. */
  firstCallMs: number;
  measuredRuns: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** Measured calls that did not return 200. Any failure makes the run invalid. */
  failures: number;
}

type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

interface LessonRow {
  id: string;
  content: { steps?: { type?: string; id?: string; choices?: { id?: string }[] }[] };
}

/**
 * Times the live `complete-lesson` Edge Function end to end (network, auth,
 * Edge Function and the `complete_lesson()` transaction), as the app sees it.
 *
 * Calls are sequential: this measures the latency of one user's request, not
 * behavior under load (that is the separate load-test item). The test account
 * re-completes the first lesson, so after its first completion every call
 * awards 0 XP; it still runs the full transaction (locks, grading, upsert,
 * event insert). Answers use each question's first choice: the score doesn't
 * change the work done, so the script never needs the answer key.
 *
 * `fetch` and the clock are injected for tests.
 */
export class CompleteLessonBenchmark {
  private constructor(
    private readonly config: BenchmarkConfig,
    private readonly fetch: Fetch,
    private readonly now: () => number,
  ) {}

  /** Validates the config. Throws with the missing variable's name, never its value. */
  static of(config: Partial<BenchmarkConfig>, fetch: Fetch, now: () => number): CompleteLessonBenchmark {
    const required: [keyof BenchmarkConfig, string][] = [
      ["url", "EXPO_PUBLIC_SUPABASE_URL"],
      ["publishableKey", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      ["testEmail", "MONITOR_TEST_EMAIL"],
      ["testPassword", "MONITOR_TEST_PASSWORD"],
    ];
    for (const [key, envName] of required) {
      if (!config[key]) throw new Error(`Set ${envName} in your shell first.`);
    }
    if (!/^https:\/\//.test(config.url!) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(config.url!)) {
      throw new Error("EXPO_PUBLIC_SUPABASE_URL must start with https:// (or be the local stack on 127.0.0.1).");
    }
    // The run writes progress and events rows, so it must never use a real account.
    if (!/\+monitor@/.test(config.testEmail!)) {
      throw new Error("MONITOR_TEST_EMAIL must be the dedicated +monitor test account.");
    }
    return new CompleteLessonBenchmark({ ...(config as BenchmarkConfig), url: config.url!.replace(/\/+$/, "") }, fetch, now);
  }

  /**
   * Nearest-rank percentile: the smallest sample with at least p% of samples
   * at or below it. With 50 samples, p95 is the 48th fastest.
   */
  static percentile(samples: readonly number[], p: number): number {
    if (samples.length === 0) throw new Error("No samples.");
    const sorted = [...samples].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.max(rank, 1) - 1];
  }

  /** Signs in, finds the first lesson, then makes the planned calls one after another. */
  async run(plan: BenchmarkPlan): Promise<BenchmarkReport> {
    if (plan.warmupRuns < 1 || plan.measuredRuns < 1) throw new Error("Need at least 1 warm-up and 1 measured run.");
    const token = await this.signIn();
    const lesson = await this.firstLesson(token);
    const body = { lessonId: lesson.id, answers: CompleteLessonBenchmark.firstChoices(lesson), timezone: "UTC" };

    const warmups: number[] = [];
    for (let i = 0; i < plan.warmupRuns; i++) {
      const call = await this.timedCompletion(token, body);
      if (call.status !== 200) throw new Error(`Warm-up call failed (HTTP ${call.status}).`);
      warmups.push(call.ms);
    }

    const samples: number[] = [];
    let failures = 0;
    for (let i = 0; i < plan.measuredRuns; i++) {
      const call = await this.timedCompletion(token, body);
      if (call.status !== 200) failures++;
      samples.push(call.ms);
    }

    return {
      lessonId: lesson.id,
      firstCallMs: warmups[0],
      measuredRuns: samples.length,
      p50Ms: CompleteLessonBenchmark.percentile(samples, 50),
      p95Ms: CompleteLessonBenchmark.percentile(samples, 95),
      maxMs: Math.max(...samples),
      failures,
    };
  }

  private async timedCompletion(token: string, body: unknown): Promise<{ status: number; ms: number }> {
    const started = this.now();
    const response = await this.request("POST", "/functions/v1/complete-lesson", token, body);
    return { status: response.status, ms: this.now() - started };
  }

  /** The lowest-position published lesson: it has no unlock requirement, so any account can complete it. */
  private async firstLesson(token: string): Promise<LessonRow> {
    const response = await this.request(
      "GET",
      "/rest/v1/lessons?select=id,content&is_published=eq.true&order=position.asc&limit=1",
      token,
    );
    const rows = CompleteLessonBenchmark.parse(response.body);
    if (response.status !== 200 || !Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Could not load a published lesson (HTTP ${response.status}).`);
    }
    return rows[0] as LessonRow;
  }

  /** One answer per question step, using its first choice. */
  private static firstChoices(lesson: LessonRow): { questionId: string; choiceId: string }[] {
    const answers = (lesson.content.steps ?? [])
      .filter((step) => step.type === "question" && step.id && step.choices?.[0]?.id)
      .map((step) => ({ questionId: step.id!, choiceId: step.choices![0].id! }));
    if (answers.length === 0) throw new Error("The first lesson has no questions to answer.");
    return answers;
  }

  /** Signs in the test account and returns its access token (kept in memory only, never printed). */
  private async signIn(): Promise<string> {
    const response = await this.request("POST", "/auth/v1/token?grant_type=password", null, {
      email: this.config.testEmail,
      password: this.config.testPassword,
    });
    const token = (CompleteLessonBenchmark.parse(response.body) as { access_token?: unknown } | undefined)?.access_token;
    if (response.status !== 200 || typeof token !== "string") {
      throw new Error(`Test account sign-in failed (HTTP ${response.status}). Check the account exists and is confirmed.`);
    }
    return token;
  }

  private async request(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; body: string }> {
    const headers: Record<string, string> = { apikey: this.config.publishableKey, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const init = body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) };
    const response = await this.fetch(`${this.config.url}${path}`, init);
    return { status: response.status, body: await response.text() };
  }

  private static parse(body: string): unknown {
    try {
      return JSON.parse(body);
    } catch {
      return undefined;
    }
  }
}
