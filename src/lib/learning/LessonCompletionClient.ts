import type { SubmittedAnswer } from "./LessonSession";

/** The 200 response from POST /complete-lesson (api/complete-lesson.md). */
export interface CompletionOutcome {
  lessonId: string;
  alreadyCompleted: boolean;
  score: { correct: number; total: number };
  xpAwarded: number;
  totalXp: number;
  level: { current: number; leveledUp: boolean; nextLevelXp: number | null };
  streak: { current: number; longest: number; extendedToday: boolean };
  unlockedLessonId: string | null;
}

export type CompletionResult =
  | { ok: true; outcome: CompletionOutcome }
  | { ok: false; code: string; message: string };

/** The one Supabase call this client needs, so tests can pass a fake. */
export type InvokeFunction = (
  name: string,
  options: { body: unknown },
) => Promise<{ data: unknown; error: { context?: unknown; message?: string } | null }>;

const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

/**
 * Sends a finished lesson to the `complete-lesson` Edge Function.
 *
 * Sends only what the user did (lesson ID, answers, time zone), never a
 * score or XP. Never throws: every outcome is a typed result the screen
 * can render, using the contract's error codes and user-safe messages.
 */
export class LessonCompletionClient {
  constructor(
    private readonly invoke: InvokeFunction,
    private readonly timeZone: () => string = deviceTimeZone,
  ) {}

  async complete(lessonId: string, answers: readonly SubmittedAnswer[]): Promise<CompletionResult> {
    try {
      const { data, error } = await this.invoke("complete-lesson", {
        body: { lessonId, answers, timezone: this.timeZone() },
      });
      if (!error) return { ok: true, outcome: data as CompletionOutcome };
      return await LessonCompletionClient.fromError(error);
    } catch {
      return { ok: false, code: "NETWORK", message: NETWORK_MESSAGE };
    }
  }

  /** Reads the contract's `{ error: { code, message } }` body from an HTTP error. */
  private static async fromError(error: { context?: unknown }): Promise<CompletionResult> {
    const response = error.context as { json?: () => Promise<unknown> } | undefined;
    if (typeof response?.json !== "function") return { ok: false, code: "NETWORK", message: NETWORK_MESSAGE };
    try {
      const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
      if (typeof body.error?.code === "string" && typeof body.error.message === "string") {
        return { ok: false, code: body.error.code, message: body.error.message };
      }
    } catch {
      // Not JSON: fall through to the generic message.
    }
    return { ok: false, code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
  }
}

/** The phone's IANA time zone (e.g. "America/Los_Angeles"), so streaks follow the user's calendar day. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
