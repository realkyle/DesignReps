import { z } from "zod";

/** Every lesson and scenario has exactly this many questions (plan: 8 lessons × 5 = 40). */
export const QUESTIONS_PER_LESSON = 5;

/** Bumped only for breaking format changes, so old files can be detected and migrated. */
export const LESSON_SCHEMA_VERSION = 1;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-kebab-case, e.g. scaling-basics");

/** Short, stable IDs (q1, c2, a…). They're stored in answers, so they must never change once published. */
const stepId = z.string().regex(/^[a-z0-9-]{1,32}$/, "must be 1–32 chars of a-z, 0-9 or -");

/** Trimmed, non-empty text with a mobile-friendly length cap. */
const text = (maxLength: number) => z.string().trim().min(1, "must not be empty").max(maxLength);

const choiceSchema = z.strictObject({
  id: stepId,
  text: text(200),
});

const conceptStepSchema = z.strictObject({
  type: z.literal("concept"),
  id: stepId,
  title: text(80),
  body: text(1200),
});

const questionStepSchema = z.strictObject({
  type: z.literal("question"),
  id: stepId,
  prompt: text(400),
  choices: z.array(choiceSchema).min(2).max(5),
  correctChoiceId: stepId,
  explanation: text(800),
});

const stepSchema = z.discriminatedUnion("type", [conceptStepSchema, questionStepSchema]);

const sourceSchema = z.strictObject({
  title: text(200),
  url: z.string().regex(/^https:\/\/\S+$/, "must be an https:// URL"),
  /** Set when the source's license requires credit, e.g. "CC BY 4.0" for the System Design Primer. */
  license: text(50).optional(),
});

/**
 * The single definition of a valid lesson file. Shape rules come from the
 * object schemas above; rules that span several fields are checked in
 * `superRefine` so every problem is reported at once, not just the first.
 */
export const lessonDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(LESSON_SCHEMA_VERSION),
    slug,
    title: text(80),
    kind: z.enum(["lesson", "scenario"]),
    position: z.number().int().positive(),
    estimatedMinutes: z.number().int().min(1).max(10),
    steps: z.array(stepSchema).min(1).max(30),
    sources: z.array(sourceSchema).min(1, "every lesson must cite at least one source"),
  })
  .superRefine((lesson, ctx) => {
    const seenStepIds = new Set<string>();
    lesson.steps.forEach((step, index) => {
      if (seenStepIds.has(step.id)) {
        ctx.addIssue({ code: "custom", path: ["steps", index, "id"], message: `duplicate step id "${step.id}"` });
      }
      seenStepIds.add(step.id);

      if (step.type !== "question") return;
      const choiceIds = step.choices.map((choice) => choice.id);
      if (new Set(choiceIds).size !== choiceIds.length) {
        ctx.addIssue({ code: "custom", path: ["steps", index, "choices"], message: "choice ids must be unique" });
      }
      if (!choiceIds.includes(step.correctChoiceId)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "correctChoiceId"],
          message: `"${step.correctChoiceId}" is not one of this question's choices`,
        });
      }
    });

    const questionCount = lesson.steps.filter((step) => step.type === "question").length;
    if (questionCount !== QUESTIONS_PER_LESSON) {
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: `must contain exactly ${QUESTIONS_PER_LESSON} questions (found ${questionCount})`,
      });
    }
    if (!lesson.steps.some((step) => step.type === "concept")) {
      ctx.addIssue({ code: "custom", path: ["steps"], message: "must contain at least one concept card" });
    }
  });

export type LessonDocument = z.infer<typeof lessonDocumentSchema>;
export type LessonStep = LessonDocument["steps"][number];
export type ConceptStep = Extract<LessonStep, { type: "concept" }>;
export type QuestionStep = Extract<LessonStep, { type: "question" }>;
export type LessonSource = LessonDocument["sources"][number];
export type LessonKind = LessonDocument["kind"];
