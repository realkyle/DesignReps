import { Lesson } from "../Lesson";
import { LessonValidationError } from "../LessonValidationError";

/** Placeholder content only: real lessons live in content/ and come from cited sources. */
function question(id: string, correctChoiceId = "a") {
  return {
    type: "question",
    id,
    prompt: `Example question ${id}?`,
    choices: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
    ],
    correctChoiceId,
    explanation: "Example explanation.",
  };
}

function validLesson(): Record<string, any> {
  return {
    schemaVersion: 1,
    slug: "example-lesson",
    title: "Example lesson",
    kind: "lesson",
    position: 1,
    estimatedMinutes: 8,
    steps: [
      { type: "concept", id: "c1", title: "Example concept", body: "Example body." },
      question("q1"),
      question("q2"),
      question("q3"),
      question("q4"),
      question("q5"),
    ],
    sources: [{ title: "Example source", url: "https://example.com/source", license: "CC BY 4.0" }],
  };
}

/** Parses and returns the issues, failing the test if parsing unexpectedly succeeds. */
function issuesFor(raw: unknown) {
  try {
    Lesson.parse(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(LessonValidationError);
    return (error as LessonValidationError).issues;
  }
  throw new Error("expected Lesson.parse to throw");
}

describe("Lesson.parse: valid input", () => {
  it("exposes the lesson through read-only getters", () => {
    const lesson = Lesson.parse(validLesson());
    expect(lesson.slug).toBe("example-lesson");
    expect(lesson.kind).toBe("lesson");
    expect(lesson.position).toBe(1);
    expect(lesson.steps).toHaveLength(6);
    expect(lesson.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(lesson.sources[0].license).toBe("CC BY 4.0");
  });

  it("accepts a scenario with the same shape", () => {
    expect(Lesson.parse({ ...validLesson(), kind: "scenario" }).kind).toBe("scenario");
  });

  it("trims surrounding whitespace in text", () => {
    const raw = validLesson();
    raw.title = "  Example lesson  ";
    expect(Lesson.parse(raw).title).toBe("Example lesson");
  });

  it("is not affected by later changes to the input object", () => {
    const raw = validLesson();
    const lesson = Lesson.parse(raw);
    raw.title = "Changed";
    expect(lesson.title).toBe("Example lesson");
  });
});

describe("Lesson.parse: invalid input", () => {
  it("rejects input that isn't an object", () => {
    expect(() => Lesson.parse("not a lesson")).toThrow(LessonValidationError);
  });

  it("requires exactly 5 questions", () => {
    const raw = validLesson();
    raw.steps.pop();
    expect(issuesFor(raw)).toContainEqual({
      path: "steps",
      message: "must contain exactly 5 questions (found 4)",
    });
  });

  it("requires at least one concept card", () => {
    const raw = validLesson();
    raw.steps.shift();
    expect(issuesFor(raw)).toContainEqual(expect.objectContaining({ message: "must contain at least one concept card" }));
  });

  it("rejects a correct answer that isn't one of the choices", () => {
    const raw = validLesson();
    raw.steps[1] = question("q1", "z");
    expect(issuesFor(raw)).toContainEqual({
      path: "steps[1].correctChoiceId",
      message: '"z" is not one of this question\'s choices',
    });
  });

  it("rejects duplicate step ids", () => {
    const raw = validLesson();
    raw.steps[2] = question("q1");
    expect(issuesFor(raw)).toContainEqual({ path: "steps[2].id", message: 'duplicate step id "q1"' });
  });

  it("rejects duplicate choice ids", () => {
    const raw = validLesson();
    raw.steps[1].choices = [
      { id: "a", text: "One" },
      { id: "a", text: "Two" },
    ];
    expect(issuesFor(raw)).toContainEqual({ path: "steps[1].choices", message: "choice ids must be unique" });
  });

  it("requires at least one source", () => {
    const raw = validLesson();
    raw.sources = [];
    expect(issuesFor(raw)).toContainEqual(
      expect.objectContaining({ path: "sources", message: "every lesson must cite at least one source" }),
    );
  });

  it("requires https source URLs", () => {
    const raw = validLesson();
    raw.sources[0].url = "http://example.com";
    expect(issuesFor(raw)).toContainEqual({ path: "sources[0].url", message: "must be an https:// URL" });
  });

  it.each([
    ["slug", "Bad Slug"],
    ["kind", "quiz"],
    ["position", 0],
    ["estimatedMinutes", 30],
    ["schemaVersion", 2],
  ])("rejects an invalid %s", (field, value) => {
    expect(issuesFor({ ...validLesson(), [field]: value })).toContainEqual(expect.objectContaining({ path: field }));
  });

  it("rejects unknown fields so typos aren't silently ignored", () => {
    expect(issuesFor({ ...validLesson(), titel: "typo" })).toHaveLength(1);
  });

  it("reports every problem at once, with the file name", () => {
    const raw = validLesson();
    raw.slug = "Bad Slug";
    raw.sources = [];
    expect(() => Lesson.parse(raw, "01-example.json")).toThrow(/in 01-example\.json \(2 issues\)/);
  });
});

describe("LessonValidationError.formatPath", () => {
  it.each([
    [[], ""],
    [["steps"], "steps"],
    [["steps", 3, "choices", 0, "id"], "steps[3].choices[0].id"],
  ])("formats %j as %j", (path, expected) => {
    expect(LessonValidationError.formatPath(path)).toBe(expected);
  });
});
