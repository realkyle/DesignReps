/** Settings for a trigger run. Read from the shell's environment by the entry script. */
export interface MonitoringConfig {
  /** Project URL, e.g. https://<ref>.supabase.co */
  url: string;
  /** The publishable key (public; the same one the app ships). */
  publishableKey: string;
  /** A dedicated test account, never a real user's. */
  testEmail: string;
  testPassword: string;
}

/** The result of one trigger: what was sent, what came back, and where to look for it. */
export interface TriggerResult {
  id: number;
  name: string;
  expectedStatus: number;
  actualStatus: number;
  /** The API or Postgres error code in the response, if there was one. */
  code?: string;
  whereToLook: string;
  ok: boolean;
}

type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

/** The response fields the triggers read: the error code in its three shapes, and the sign-in token. */
interface ResponseFields {
  error?: { code?: unknown };
  code?: unknown;
  error_code?: unknown;
  access_token?: unknown;
}

/** A lesson ID that can't exist, so complete-lesson stops at LESSON_NOT_FOUND before any write. */
const MISSING_LESSON_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Sends five requests to a Supabase project that each fail on purpose, so
 * the daily-review queries can be checked against known errors. One trigger
 * per log source (Auth, Postgres, API gateway, Edge Functions).
 *
 * Every trigger is safe to run against production:
 *   1. wrong password            → 400, auth_logs              (no write)
 *   2. log_event with a bad type → 400, Postgres ERROR 22023   (raises before the insert)
 *   3. complete-lesson, no token → 401 UNAUTHENTICATED         (stops at the auth check)
 *   4. complete-lesson, unknown lesson → 404 LESSON_NOT_FOUND  (returned error, transaction rolls back)
 *   5. delete-account, no token  → 401 UNAUTHENTICATED         (stops at the auth check)
 *
 * delete-account is never sent a token: {@link post} only adds one when
 * given, and trigger 5 passes null. A test checks this.
 *
 * Plain REST calls (no supabase-js) so each request is easy to read and
 * match to a line in the logs. `fetch` is injected for tests.
 */
export class MonitoringTriggers {
  private constructor(
    private readonly config: MonitoringConfig,
    private readonly fetch: Fetch,
  ) {}

  /** Validates the config. Throws with the missing variable's name, never its value. */
  static of(config: Partial<MonitoringConfig>, fetch: Fetch): MonitoringTriggers {
    const required: [keyof MonitoringConfig, string][] = [
      ["url", "EXPO_PUBLIC_SUPABASE_URL"],
      ["publishableKey", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      ["testEmail", "MONITOR_TEST_EMAIL"],
      ["testPassword", "MONITOR_TEST_PASSWORD"],
    ];
    for (const [key, envName] of required) {
      if (!config[key]) throw new Error(`Set ${envName} in your shell first.`);
    }
    // https everywhere, except the local stack (npx supabase start) for trying the script out.
    if (!/^https:\/\//.test(config.url!) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(config.url!)) {
      throw new Error("EXPO_PUBLIC_SUPABASE_URL must start with https:// (or be the local stack on 127.0.0.1).");
    }
    if (!/\+monitor@/.test(config.testEmail!)) {
      throw new Error("MONITOR_TEST_EMAIL must be the dedicated +monitor test account.");
    }
    return new MonitoringTriggers({ ...(config as MonitoringConfig), url: config.url!.replace(/\/+$/, "") }, fetch);
  }

  /** Runs the five triggers in order and returns one result each. */
  async runAll(): Promise<TriggerResult[]> {
    const results = [await this.wrongPassword()];

    const token = await this.signIn();
    results.push(await this.logEventBadType(token));
    results.push(await this.completeLessonNoToken());
    results.push(await this.completeLessonUnknownLesson(token));
    results.push(await this.deleteAccountNoToken());
    return results;
  }

  private async wrongPassword(): Promise<TriggerResult> {
    const response = await this.post("/auth/v1/token?grant_type=password", {
      email: this.config.testEmail,
      password: `${this.config.testPassword}-wrong`,
    });
    return MonitoringTriggers.result(1, "sign in with a wrong password", 400, response, "Logs > Auth (auth_logs)");
  }

  private async logEventBadType(token: string): Promise<TriggerResult> {
    const response = await this.post("/rest/v1/rpc/log_event", { p_type: "monitoring_test" }, token);
    return MonitoringTriggers.result(
      2,
      "log_event with an unknown type",
      400,
      response,
      "Logs > Postgres (postgres_logs, ERROR 22023) and Logs > API Gateway (edge_logs)",
    );
  }

  private async completeLessonNoToken(): Promise<TriggerResult> {
    const response = await this.post("/functions/v1/complete-lesson", {}, null);
    return MonitoringTriggers.result(3, "complete-lesson with no token", 401, response, "Edge Functions > complete-lesson > Logs");
  }

  private async completeLessonUnknownLesson(token: string): Promise<TriggerResult> {
    const response = await this.post(
      "/functions/v1/complete-lesson",
      { lessonId: MISSING_LESSON_ID, answers: [{ questionId: "q1", choiceId: "a" }] },
      token,
    );
    return MonitoringTriggers.result(4, "complete-lesson with an unknown lesson", 404, response, "Edge Functions > complete-lesson > Logs");
  }

  private async deleteAccountNoToken(): Promise<TriggerResult> {
    // Never pass a token here: with one, this request would delete the account.
    const response = await this.post("/functions/v1/delete-account", {}, null);
    return MonitoringTriggers.result(5, "delete-account with no token", 401, response, "Edge Functions > delete-account > Logs");
  }

  /** Signs in the test account and returns its access token (kept in memory only, never printed). */
  private async signIn(): Promise<string> {
    const response = await this.post("/auth/v1/token?grant_type=password", {
      email: this.config.testEmail,
      password: this.config.testPassword,
    });
    const token = MonitoringTriggers.parse(response.body)?.access_token;
    if (response.status !== 200 || typeof token !== "string") {
      throw new Error(`Test account sign-in failed (HTTP ${response.status}). Check the account exists and is confirmed.`);
    }
    return token;
  }

  private async post(path: string, body: unknown, token: string | null = null): Promise<{ status: number; body: string }> {
    const headers: Record<string, string> = { apikey: this.config.publishableKey, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await this.fetch(`${this.config.url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.text() };
  }

  private static result(
    id: number,
    name: string,
    expectedStatus: number,
    response: { status: number; body: string },
    whereToLook: string,
  ): TriggerResult {
    const parsed = MonitoringTriggers.parse(response.body);
    // Edge Functions: { error: { code } }. PostgREST: { code }. Auth: { error_code }
    // (Auth also has a numeric `code`, the HTTP status, so take the first string).
    const code = [parsed?.error?.code, parsed?.code, parsed?.error_code].find((c): c is string => typeof c === "string");
    return { id, name, expectedStatus, actualStatus: response.status, code, whereToLook, ok: response.status === expectedStatus };
  }

  private static parse(body: string): ResponseFields | undefined {
    try {
      const parsed: unknown = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null ? (parsed as ResponseFields) : undefined;
    } catch {
      return undefined;
    }
  }
}
