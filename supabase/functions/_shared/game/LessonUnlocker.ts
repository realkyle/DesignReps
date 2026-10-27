/** The minimum a lesson needs for unlock decisions. */
export interface OrderedLesson {
  id: string;
  /** 1-based order within its track. */
  position: number;
}

/**
 * Sequential unlocking within a track: lesson 1 is always open, and lesson n
 * opens once lesson n − 1 is completed.
 */
export class LessonUnlocker {
  private readonly byPosition: ReadonlyMap<number, OrderedLesson>;

  /**
   * @param trackLessons - Every published lesson in ONE track.
   * @throws {RangeError} if positions aren't exactly 1..n (gaps or duplicates).
   */
  constructor(trackLessons: readonly OrderedLesson[]) {
    const positions = trackLessons.map((lesson) => lesson.position).sort((a, b) => a - b);
    positions.forEach((position, index) => {
      if (position !== index + 1) throw new RangeError("Lesson positions must run 1..n with no gaps or duplicates");
    });
    this.byPosition = new Map(trackLessons.map((lesson) => [lesson.position, lesson]));
  }

  /**
   * Whether the user may take the lesson at `position`.
   *
   * @param completedLessonIds - IDs of lessons this user has completed.
   */
  isUnlocked(position: number, completedLessonIds: ReadonlySet<string>): boolean {
    if (position === 1) return true;
    const previous = this.byPosition.get(position - 1);
    return previous !== undefined && completedLessonIds.has(previous.id);
  }

  /** The lesson that must be completed first, or null if `position` is already open by default. */
  prerequisiteFor(position: number): OrderedLesson | null {
    return position === 1 ? null : (this.byPosition.get(position - 1) ?? null);
  }

  /**
   * The lesson a completion newly unlocks: the next one, but only on the
   * FIRST completion (a repeat unlocks nothing new) and only if one exists.
   */
  unlockedBy(position: number, alreadyCompleted: boolean): OrderedLesson | null {
    if (alreadyCompleted) return null;
    return this.byPosition.get(position + 1) ?? null;
  }
}
