export type LessonKind = "lesson" | "scenario";

/** XP values per kind of content (see api/complete-lesson.md, "Game rules"). */
export interface XpValues {
  lesson: number;
  scenario: number;
}

/**
 * Decides how much XP a completion is worth.
 *
 * Only the FIRST completion of a lesson earns XP, so replaying for practice
 * is allowed but can't be used to farm XP.
 */
export class XpPolicy {
  constructor(private readonly values: XpValues) {}

  /**
   * @param kind - Whether the content is a lesson or a scenario.
   * @param alreadyCompleted - True if this user finished this lesson before.
   */
  xpFor(kind: LessonKind, alreadyCompleted: boolean): number {
    if (alreadyCompleted) return 0;
    return this.values[kind];
  }
}
