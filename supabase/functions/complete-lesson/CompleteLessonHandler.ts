import { ApiError } from "./ApiError.ts";
import { type Answer, CompleteLessonRequest } from "./CompleteLessonRequest.ts";

/** What the handler needs from the outside world. Injected, so tests use fakes. */
export interface CompleteLessonDeps {
  /** Verifies a Supabase access token. Returns the user's ID, or null if it isn't valid. */
  verifyAccessToken(token: string): Promise<string | null>;
  /** Calls the `complete_lesson` database function and returns its JSON result. */
  completeLesson(input: { userId: string; lessonId: string; answers: readonly Answer[]; timezone: string }): Promise<unknown>;
  /** Server-side log for unexpected failures. Never sent to the client. */
  logError(message: string, error: unknown): void;
}

/** The parts of an HTTP request the handler looks at. */
export interface HttpRequest {
  method: string;
  authorization: string | null;
  readBody(): Promise<string>;
}

export interface HttpResponse {
  status: number;
  body: string | null;
}

/**
 * POST /complete-lesson (api/complete-lesson.md).
 *
 * Runs the contract's checks in order (method → auth → body shape), then
 * hands everything else to the `complete_lesson` database function, which
 * does the content checks, the row lock, the game rules and the writes in
 * one transaction. The user ID always comes from the verified token, never
 * from the body.
 */
export class CompleteLessonHandler {
  constructor(private readonly deps: CompleteLessonDeps) {}

  async handle(request: HttpRequest): Promise<HttpResponse> {
    if (request.method === "OPTIONS") return { status: 204, body: null };
    if (request.method !== "POST") {
      return CompleteLessonHandler.error(ApiError.of("METHOD_NOT_ALLOWED", "Use POST."));
    }

    try {
      // 1. Auth (401) comes first, so a malformed request from a signed-out user gets 401.
      const token = CompleteLessonHandler.bearerToken(request.authorization);
      const userId = token ? await this.deps.verifyAccessToken(token) : null;
      if (!userId) return CompleteLessonHandler.error(ApiError.unauthenticated());

      // 2. Body shape (400).
      const parsed = CompleteLessonRequest.parse(await request.readBody());
      if (!parsed.ok) return CompleteLessonHandler.error(parsed.error);
      const { lessonId, answers, timezone } = parsed.request;

      // 3. Everything else happens in the database, in one transaction.
      const result = await this.deps.completeLesson({ userId, lessonId, answers, timezone });
      return CompleteLessonHandler.fromDatabase(result);
    } catch (error) {
      this.deps.logError("complete-lesson failed", error);
      return CompleteLessonHandler.error(ApiError.internal());
    }
  }

  /** Maps the database function's `{ error: { code… } }` to an HTTP status, or passes the success body through. */
  private static fromDatabase(result: unknown): HttpResponse {
    if (typeof result !== "object" || result === null) throw new Error("complete_lesson returned no object");

    const error = (result as { error?: { code?: unknown; message?: unknown; details?: unknown } }).error;
    if (error === undefined) return { status: 200, body: JSON.stringify(result) };

    if (!ApiError.isKnownCode(error.code) || typeof error.message !== "string") {
      throw new Error(`complete_lesson returned an unknown error: ${JSON.stringify(error)}`);
    }
    const details = typeof error.details === "object" && error.details !== null ? (error.details as Record<string, unknown>) : undefined;
    return CompleteLessonHandler.error(ApiError.of(error.code, error.message, details));
  }

  private static error(error: ApiError): HttpResponse {
    return { status: error.status, body: JSON.stringify(error.toBody()) };
  }

  private static bearerToken(header: string | null): string | null {
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : null;
  }
}
