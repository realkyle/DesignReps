/** How serious a log line is. Logs Explorer queries filter on this. */
export type LogLevel = "info" | "warn" | "error";

/** What one request's summary line records. Never a user ID, token or request body. */
export interface RequestSummary {
  fn: string;
  status: number;
  ms: number;
  /** The API error code from the response body, when there was one. */
  code?: string;
}

/**
 * Builds the JSON log lines every Edge Function writes, so all of them have
 * one shape that the saved Logs Explorer queries can filter on
 * (`supabase/snippets/monitoring/`).
 *
 * Only builds strings; the entry point does the actual `console.*` call, so
 * this stays a pure, testable class.
 */
export class RequestLog {
  private constructor() {}

  /** Status → level: below 400 is info, 4xx is warn (the client's fault), 5xx is error (ours). */
  static levelFor(status: number): LogLevel {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    return "info";
  }

  /**
   * One line per request, e.g.
   * `{"fn":"complete-lesson","level":"warn","status":404,"code":"LESSON_NOT_FOUND","ms":87}`.
   */
  static summary({ fn, status, ms, code }: RequestSummary): string {
    return JSON.stringify({ fn, level: RequestLog.levelFor(status), status, ...(code ? { code } : {}), ms: Math.round(ms) });
  }

  /**
   * One line for an unexpected failure. Copies only `name`, `code` and
   * `message` from the error: database and auth errors can also carry
   * `details` or `hint` with row data, which the privacy policy doesn't
   * promise to log.
   */
  static failure(fn: string, message: string, error: unknown): string {
    return JSON.stringify({ fn, level: "error", msg: message, error: RequestLog.safeError(error) });
  }

  /** Reads `error.code` from a response body in the API's error shape, or undefined. */
  static errorCodeOf(body: string | null): string | undefined {
    if (!body) return undefined;
    try {
      const code = (JSON.parse(body) as { error?: { code?: unknown } })?.error?.code;
      return typeof code === "string" ? code : undefined;
    } catch {
      return undefined;
    }
  }

  private static safeError(error: unknown): { name?: string; code?: string; message: string } {
    if (typeof error !== "object" || error === null) return { message: String(error) };
    const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof code === "string" ? { code } : {}),
      message: typeof message === "string" ? message : "unknown error",
    };
  }
}
