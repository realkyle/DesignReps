import { type CompleteLessonDeps, CompleteLessonHandler, type HttpRequest } from "../CompleteLessonHandler.ts";

const LESSON_ID = "6f1c2a9e-3b7d-4c55-9a10-2f8e4d1b7c33";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const ANSWERS = [
  { questionId: "q1", choiceId: "a" },
  { questionId: "q2", choiceId: "b" },
];
const SUCCESS = {
  lessonId: LESSON_ID,
  alreadyCompleted: false,
  score: { correct: 2, total: 2 },
  xpAwarded: 10,
  totalXp: 10,
  level: { current: 1, leveledUp: false, nextLevelXp: 20 },
  streak: { current: 1, longest: 1, extendedToday: true },
  unlockedLessonId: null,
};

function setup(overrides: Partial<CompleteLessonDeps> = {}) {
  const deps = {
    verifyAccessToken: jest.fn(async (token: string) => (token === "good-token" ? USER_ID : null)),
    completeLesson: jest.fn(async () => SUCCESS as unknown),
    logError: jest.fn(),
    ...overrides,
  };
  return { deps, handler: new CompleteLessonHandler(deps) };
}

function post(body: unknown, authorization: string | null = "Bearer good-token"): HttpRequest {
  return {
    method: "POST",
    authorization,
    readBody: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const validBody = { lessonId: LESSON_ID, answers: ANSWERS, timezone: "America/Los_Angeles" };

async function errorOf(response: Promise<{ status: number; body: string | null }>) {
  const { status, body } = await response;
  return { status, ...JSON.parse(body!).error };
}

describe("CompleteLessonHandler: success", () => {
  it("returns 200 with the database result", async () => {
    const { handler } = setup();
    const response = await handler.handle(post(validBody));
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body!)).toEqual(SUCCESS);
  });

  it("passes the user ID from the TOKEN, never from the body", async () => {
    const { handler, deps } = setup();
    await handler.handle(post({ ...validBody, userId: "someone-else" }));
    expect(deps.completeLesson).toHaveBeenCalledWith({
      userId: USER_ID,
      lessonId: LESSON_ID,
      answers: ANSWERS,
      timezone: "America/Los_Angeles",
    });
  });

  it("defaults the time zone to UTC and drops unknown answer fields", async () => {
    const { handler, deps } = setup();
    await handler.handle(post({ lessonId: LESSON_ID, answers: [{ questionId: "q1", choiceId: "a", score: 100 }] }));
    expect(deps.completeLesson).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "UTC", answers: [{ questionId: "q1", choiceId: "a" }] }),
    );
  });

  it("never sends a client-supplied score or XP to the database", async () => {
    const { handler, deps } = setup();
    await handler.handle(post({ ...validBody, xp: 1000, score: 5 }));
    const input = (deps.completeLesson as jest.Mock).mock.calls[0][0];
    expect(Object.keys(input as object).sort()).toEqual(["answers", "lessonId", "timezone", "userId"]);
  });
});

describe("CompleteLessonHandler: Error 1 (401)", () => {
  it.each([
    ["no Authorization header", null],
    ["not a Bearer token", "Basic abc"],
    ["an invalid or expired token", "Bearer bad-token"],
  ])("%s → 401", async (_, authorization) => {
    const { handler, deps } = setup();
    const error = await errorOf(handler.handle(post(validBody, authorization)));
    expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(deps.completeLesson).not.toHaveBeenCalled();
  });

  it("checks auth before the body: a malformed request from a signed-out user gets 401", async () => {
    const { handler } = setup();
    expect(await errorOf(handler.handle(post("{not json", null)))).toMatchObject({ status: 401 });
  });
});

describe("CompleteLessonHandler: Error 2 (400)", () => {
  it.each([
    ["invalid JSON", "{not json", "body"],
    ["a JSON array", [], "body"],
    ["a bad UUID", { ...validBody, lessonId: "lesson-1" }, "lessonId"],
    ["answers missing", { lessonId: LESSON_ID }, "answers"],
    ["empty answers", { ...validBody, answers: [] }, "answers"],
    ["more than 20 answers", { ...validBody, answers: Array.from({ length: 21 }, (_, i) => ({ questionId: `q${i}`, choiceId: "a" })) }, "answers"],
    ["an answer without choiceId", { ...validBody, answers: [{ questionId: "q1" }] }, "answers[0]"],
    ["a duplicate question", { ...validBody, answers: [ANSWERS[0], ANSWERS[0]] }, "answers"],
    ["an invalid time zone", { ...validBody, timezone: "Mars/Olympus_Mons" }, "timezone"],
    ["a body over 16 KB", JSON.stringify({ ...validBody, padding: "x".repeat(17 * 1024) }), "body"],
  ])("%s → 400", async (_, body, field) => {
    const { handler, deps } = setup();
    const error = await errorOf(handler.handle(post(body)));
    expect(error).toMatchObject({ status: 400, code: "INVALID_REQUEST", details: { field } });
    expect(deps.completeLesson).not.toHaveBeenCalled();
  });
});

describe("CompleteLessonHandler: errors from the database function", () => {
  it.each([
    ["INVALID_REQUEST", 400],
    ["LESSON_NOT_FOUND", 404],
    ["LESSON_LOCKED", 403],
    ["UNAUTHENTICATED", 401],
  ])("%s → %i, with message and details passed through", async (code, status) => {
    const dbError = { code, message: "Message.", details: { requiredLessonId: "x" } };
    const { handler } = setup({ completeLesson: jest.fn(async () => ({ error: dbError })) });
    expect(await errorOf(handler.handle(post(validBody)))).toEqual({ status, ...dbError });
  });

  it("an unknown error code → 500, logged server-side", async () => {
    const { handler, deps } = setup({ completeLesson: jest.fn(async () => ({ error: { code: "WEIRD", message: "?" } })) });
    expect(await errorOf(handler.handle(post(validBody)))).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(deps.logError).toHaveBeenCalled();
  });

  it("a database failure → 500 with no internal details", async () => {
    const { handler, deps } = setup({
      completeLesson: jest.fn(async () => {
        throw new Error("connection refused at 10.0.0.5");
      }),
    });
    const { status, body } = await handler.handle(post(validBody));
    expect(status).toBe(500);
    expect(body).not.toContain("10.0.0.5");
    expect(deps.logError).toHaveBeenCalledWith("complete-lesson failed", expect.any(Error));
  });
});

describe("CompleteLessonHandler: methods", () => {
  it("answers OPTIONS (CORS preflight) with 204", async () => {
    const { handler } = setup();
    expect(await handler.handle({ method: "OPTIONS", authorization: null, readBody: async () => "" })).toEqual({
      status: 204,
      body: null,
    });
  });

  it("rejects GET with 405", async () => {
    const { handler } = setup();
    const error = await errorOf(handler.handle({ method: "GET", authorization: null, readBody: async () => "" }));
    expect(error).toMatchObject({ status: 405, code: "METHOD_NOT_ALLOWED" });
  });
});
