import {
  lessonDocumentSchema,
  type LessonDocument,
  type LessonKind,
  type LessonSource,
  type LessonStep,
  type QuestionStep,
} from "./lessonSchema";
import { LessonValidationError } from "./LessonValidationError";

/**
 * A validated, read-only lesson or scenario.
 *
 * The constructor is private: the only way to get a `Lesson` is `Lesson.parse`,
 * so every instance is guaranteed to satisfy the content format. The lesson
 * engine, seed script and tests can rely on that instead of re-checking.
 */
export class Lesson {
  private constructor(private readonly document: LessonDocument) {}

  /**
   * Validates raw JSON (e.g. a parsed lesson file) and wraps it.
   *
   * @param raw - Untrusted input, typically `JSON.parse` of a lesson file.
   * @param source - Optional label (such as a file name) included in error messages.
   * @throws {LessonValidationError} listing every problem found.
   */
  static parse(raw: unknown, source?: string): Lesson {
    const result = lessonDocumentSchema.safeParse(raw);
    if (!result.success) {
      throw new LessonValidationError(
        result.error.issues.map((issue) => ({
          path: LessonValidationError.formatPath(issue.path),
          message: issue.message,
        })),
        source,
      );
    }
    return new Lesson(result.data);
  }

  get slug(): string {
    return this.document.slug;
  }

  get title(): string {
    return this.document.title;
  }

  /** `lesson` or `scenario`; the server uses this to award 10 or 25 XP. */
  get kind(): LessonKind {
    return this.document.kind;
  }

  /** 1-based order within its track; drives unlocking. */
  get position(): number {
    return this.document.position;
  }

  get estimatedMinutes(): number {
    return this.document.estimatedMinutes;
  }

  /** Concept cards and questions, in the order they are shown. */
  get steps(): readonly LessonStep[] {
    return this.document.steps;
  }

  /** Just the graded steps, in order. */
  get questions(): readonly QuestionStep[] {
    return this.document.steps.filter((step): step is QuestionStep => step.type === "question");
  }

  get sources(): readonly LessonSource[] {
    return this.document.sources;
  }
}
