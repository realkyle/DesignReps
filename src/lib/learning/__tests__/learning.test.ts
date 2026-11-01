import { Lesson } from "@/lib/lessons";

import sample from "../../../../content/system-design/01-scaling-basics.json";
import { type InvokeFunction, LessonCompletionClient } from "../LessonCompletionClient";
import { LessonPath, type PathLesson } from "../LessonPath";
import { LessonSession } from "../LessonSession";

// ---------------------------------------------------------------------------
// LessonPath
// ---------------------------------------------------------------------------
const lessons: PathLesson[] = [
  { id: "l3", slug: "three", title: "Three", kind: "scenario", position: 3 },
  { id: "l1", slug: "one", title: "One", kind: "lesson", position: 1 },
  { id: "l2", slug: "two", title: "Two", kind: "lesson", position: 2 },
];

describe("LessonPath", () => {
  it("orders by position; only lesson 1 is open for a new user", () => {
    const path = LessonPath.build("Track", lessons, new Set());
    expect(path.items.map((item) => [item.id, item.status])).toEqual([
      ["l1", "unlocked"],
      ["l2", "locked"],
      ["l3", "locked"],
    ]);
    expect(path.nextLesson?.id).toBe("l1");
  });

  it("completing lesson n unlocks lesson n + 1", () => {
    const path = LessonPath.build("Track", lessons, new Set(["l1"]));
    expect(path.items.map((item) => item.status)).toEqual(["completed", "unlocked", "locked"]);
    expect(path.completedCount).toBe(1);
  });

  it("everything done → no next lesson", () => {
    const path = LessonPath.build("Track", lessons, new Set(["l1", "l2", "l3"]));
    expect(path.nextLesson).toBeUndefined();
    expect(path.completedCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// LessonSession (uses the real sample lesson: c1, q1, c2, q2, q3, c3, q4, q5)
// ---------------------------------------------------------------------------
const lesson = Lesson.parse(sample);

describe("LessonSession", () => {
  it("starts on the first step with Continue enabled for a concept card", () => {
    const session = LessonSession.start(lesson);
    expect(session.step?.id).toBe("c1");
    expect(session.canContinue).toBe(true);
    expect(session.progress).toBe(0);
  });

  it("a question needs an answer before Continue", () => {
    const onQuestion = LessonSession.start(lesson).next();
    expect(onQuestion.step?.id).toBe("q1");
    expect(onQuestion.canContinue).toBe(false);
    expect(() => onQuestion.next()).toThrow();
  });

  it("answering gives instant feedback with the explanation", () => {
    const wrong = LessonSession.start(lesson).next().answer("a");
    expect(wrong.feedback).toMatchObject({ correct: false, correctChoiceId: "b" });
    expect(wrong.feedback?.explanation).toMatch(/scalability problem/);
    expect(wrong.canContinue).toBe(true);

    const right = LessonSession.start(lesson).next().answer("b");
    expect(right.feedback?.correct).toBe(true);
  });

  it("is immutable: answering returns a new session", () => {
    const before = LessonSession.start(lesson).next();
    const after = before.answer("b");
    expect(before.feedback).toBeNull();
    expect(after).not.toBe(before);
  });

  it("rejects answering twice, unknown choices, and answering a concept card", () => {
    const answered = LessonSession.start(lesson).next().answer("b");
    expect(() => answered.answer("a")).toThrow(/already answered/);
    expect(() => LessonSession.start(lesson).next().answer("zzz")).toThrow(/Unknown choice/);
    expect(() => LessonSession.start(lesson).answer("a")).toThrow(/not a question/);
  });

  it("walks to the end and builds the submission in question order", () => {
    let session = LessonSession.start(lesson);
    const picks: Record<string, string> = { q1: "b", q2: "b", q3: "b", q4: "a", q5: "a" };
    while (!session.isFinished) {
      const step = session.step!;
      if (step.type === "question") session = session.answer(picks[step.id]);
      session = session.next();
    }
    expect(session.progress).toBe(1);
    expect(session.submission).toEqual([
      { questionId: "q1", choiceId: "b" },
      { questionId: "q2", choiceId: "b" },
      { questionId: "q3", choiceId: "b" },
      { questionId: "q4", choiceId: "a" },
      { questionId: "q5", choiceId: "a" },
    ]);
    expect(session.correctCount).toBe(4); // q4's right answer is b
  });
});

// ---------------------------------------------------------------------------
// LessonCompletionClient
// ---------------------------------------------------------------------------
const outcome = {
  lessonId: "l1",
  alreadyCompleted: false,
  score: { correct: 5, total: 5 },
  xpAwarded: 10,
  totalXp: 10,
  level: { current: 1, leveledUp: false, nextLevelXp: 20 },
  streak: { current: 1, longest: 1, extendedToday: true },
  unlockedLessonId: "l2",
};

function client(result: Awaited<ReturnType<InvokeFunction>> | Error) {
  const invoke = jest.fn<ReturnType<InvokeFunction>, Parameters<InvokeFunction>>(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { invoke, completion: new LessonCompletionClient(invoke, () => "America/Los_Angeles") };
}

describe("LessonCompletionClient", () => {
  it("sends only lesson ID, answers and time zone (never a score or XP)", async () => {
    const { invoke, completion } = client({ data: outcome, error: null });
    await completion.complete("l1", [{ questionId: "q1", choiceId: "b" }]);
    expect(invoke).toHaveBeenCalledWith("complete-lesson", {
      body: { lessonId: "l1", answers: [{ questionId: "q1", choiceId: "b" }], timezone: "America/Los_Angeles" },
    });
  });

  it("returns the server's outcome on success", async () => {
    const { completion } = client({ data: outcome, error: null });
    expect(await completion.complete("l1", [])).toEqual({ ok: true, outcome });
  });

  it("reads the contract's error body (e.g. 403 LESSON_LOCKED)", async () => {
    const body = { error: { code: "LESSON_LOCKED", message: "Complete the previous lesson first." } };
    const { completion } = client({ data: null, error: { context: { json: async () => body } } });
    expect(await completion.complete("l2", [])).toEqual({ ok: false, ...body.error });
  });

  it("a thrown network error becomes a NETWORK result (never throws)", async () => {
    const { completion } = client(new Error("offline"));
    expect(await completion.complete("l1", [])).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("a non-JSON error body becomes a generic error", async () => {
    const { completion } = client({ data: null, error: { context: { json: async () => Promise.reject(new Error("bad")) } } });
    expect(await completion.complete("l1", [])).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });
});
