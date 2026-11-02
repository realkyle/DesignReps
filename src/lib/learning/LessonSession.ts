import type { Lesson, LessonStep } from "@/lib/lessons";

/** Shown right after a question is answered. */
export interface AnswerFeedback {
  correct: boolean;
  correctChoiceId: string;
  explanation: string;
}

export interface SubmittedAnswer {
  questionId: string;
  choiceId: string;
}

/**
 * One run through a lesson: which step is showing, what was answered, and
 * the feedback for the current question.
 *
 * Immutable: `answer` and `next` return a new session, which fits React state
 * (`setSession(session.next())`) and makes every transition easy to test.
 *
 * Grading here only drives instant feedback. The server re-grades the
 * submitted answers, and its result is the one that counts.
 */
export class LessonSession {
  private constructor(
    readonly lesson: Lesson,
    readonly stepIndex: number,
    private readonly answers: ReadonlyMap<string, string>,
    readonly feedback: AnswerFeedback | null,
  ) {}

  static start(lesson: Lesson): LessonSession {
    return new LessonSession(lesson, 0, new Map(), null);
  }

  /** The step on screen. Undefined once the last step is passed (`isFinished`). */
  get step(): LessonStep | undefined {
    return this.lesson.steps[this.stepIndex];
  }

  get isFinished(): boolean {
    return this.stepIndex >= this.lesson.steps.length;
  }

  /** 0 to 1, for the progress bar. */
  get progress(): number {
    return Math.min(this.stepIndex / this.lesson.steps.length, 1);
  }

  /** True when the Continue button should be enabled. */
  get canContinue(): boolean {
    const step = this.step;
    if (!step) return false;
    return step.type === "concept" || this.feedback !== null;
  }

  /** Picks a choice on the current question and returns the session with feedback. */
  answer(choiceId: string): LessonSession {
    const step = this.step;
    if (!step || step.type !== "question") throw new Error("The current step is not a question");
    if (this.feedback) throw new Error("This question was already answered");
    if (!step.choices.some((choice) => choice.id === choiceId)) throw new Error(`Unknown choice "${choiceId}"`);

    const answers = new Map(this.answers).set(step.id, choiceId);
    const feedback = { correct: choiceId === step.correctChoiceId, correctChoiceId: step.correctChoiceId, explanation: step.explanation };
    return new LessonSession(this.lesson, this.stepIndex, answers, feedback);
  }

  /** Moves to the next step. */
  next(): LessonSession {
    if (!this.canContinue) throw new Error("Answer the question before continuing");
    return new LessonSession(this.lesson, this.stepIndex + 1, this.answers, null);
  }

  /** The chosen answer for a question, if any. */
  answerFor(questionId: string): string | undefined {
    return this.answers.get(questionId);
  }

  /** The body for POST /complete-lesson: one answer per question, in lesson order. */
  get submission(): SubmittedAnswer[] {
    return this.lesson.questions
      .filter((question) => this.answers.has(question.id))
      .map((question) => ({ questionId: question.id, choiceId: this.answers.get(question.id)! }));
  }

  get correctCount(): number {
    return this.lesson.questions.filter((question) => this.answers.get(question.id) === question.correctChoiceId).length;
  }
}
