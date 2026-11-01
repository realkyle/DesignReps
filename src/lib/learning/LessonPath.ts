export type LessonStatus = "completed" | "unlocked" | "locked";

/** A lesson as listed on the path (no content; that loads when it's opened). */
export interface PathLesson {
  id: string;
  slug: string;
  title: string;
  kind: "lesson" | "scenario";
  position: number;
}

export interface PathItem extends PathLesson {
  status: LessonStatus;
}

/**
 * The home screen's lesson path: each lesson in order with its status.
 *
 * Mirrors the server's unlock rule (lesson 1 is open; lesson n opens once
 * lesson n − 1 is completed) so the screen can show locks without a round
 * trip. It's for display only: the server re-checks the rule on every
 * submission (403 LESSON_LOCKED), so a tampered app gains nothing.
 */
export class LessonPath {
  private constructor(
    readonly trackTitle: string,
    readonly items: readonly PathItem[],
  ) {}

  static build(trackTitle: string, lessons: readonly PathLesson[], completedIds: ReadonlySet<string>): LessonPath {
    const ordered = [...lessons].sort((a, b) => a.position - b.position);
    const items = ordered.map((lesson, index): PathItem => {
      if (completedIds.has(lesson.id)) return { ...lesson, status: "completed" };
      const previousDone = index === 0 || completedIds.has(ordered[index - 1].id);
      return { ...lesson, status: previousDone ? "unlocked" : "locked" };
    });
    return new LessonPath(trackTitle, items);
  }

  /** The lesson to suggest next: the first one that's open but not done. */
  get nextLesson(): PathItem | undefined {
    return this.items.find((item) => item.status === "unlocked");
  }

  get completedCount(): number {
    return this.items.filter((item) => item.status === "completed").length;
  }
}
