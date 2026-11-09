import { ApiError } from "../_shared/http/ApiError.ts";

export interface Answer {
  questionId: string;
  choiceId: string;
}

export type ParseResult = { ok: true; request: CompleteLessonRequest } | { ok: false; error: ApiError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_ID = /^[a-z0-9-]{1,32}$/;

/**
 * A `complete-lesson` request body that passed the contract's shape rules.
 *
 * Only shape is checked here (JSON, UUID, answer objects, limits, duplicates,
 * time zone). Rules that need the lesson's content (unknown question or
 * choice, missing answer) are checked by the database function, which has
 * the lesson. Private constructor: the only way in is `parse`.
 */
export class CompleteLessonRequest {
  /** Contract "Input limits". */
  static readonly MAX_BODY_BYTES = 16 * 1024;
  static readonly MAX_ANSWERS = 20;

  private constructor(
    readonly lessonId: string,
    readonly answers: readonly Answer[],
    readonly timezone: string,
  ) {}

  static parse(bodyText: string): ParseResult {
    if (new TextEncoder().encode(bodyText).length > CompleteLessonRequest.MAX_BODY_BYTES) {
      return fail("body", "larger than 16 KB");
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return fail("body", "not valid JSON");
    }
    if (!isObject(body)) return fail("body", "must be a JSON object");

    const { lessonId, answers, timezone = "UTC" } = body;
    if (typeof lessonId !== "string" || !UUID.test(lessonId)) return fail("lessonId", "must be a UUID");

    if (!Array.isArray(answers) || answers.length === 0 || answers.length > CompleteLessonRequest.MAX_ANSWERS) {
      return fail("answers", `must be an array of 1-${CompleteLessonRequest.MAX_ANSWERS} answers`);
    }
    const seen = new Set<string>();
    for (const [index, answer] of answers.entries()) {
      if (!isObject(answer) || typeof answer.questionId !== "string" || typeof answer.choiceId !== "string") {
        return fail(`answers[${index}]`, "must have string questionId and choiceId");
      }
      if (!STEP_ID.test(answer.questionId)) return fail(`answers[${index}].questionId`, "unknown question");
      if (!STEP_ID.test(answer.choiceId)) return fail(`answers[${index}].choiceId`, "unknown choice");
      if (seen.has(answer.questionId)) return fail("answers", "duplicate question");
      seen.add(answer.questionId);
    }

    if (typeof timezone !== "string" || !isTimeZone(timezone)) return fail("timezone", "unknown time zone");

    const cleanAnswers = answers.map((answer) => ({ questionId: answer.questionId, choiceId: answer.choiceId }));
    return { ok: true, request: new CompleteLessonRequest(lessonId.toLowerCase(), cleanAnswers, timezone) };
  }
}

function fail(field: string, reason: string): ParseResult {
  return { ok: false, error: ApiError.invalid(field, reason) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeZone(name: string): boolean {
  if (name.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
