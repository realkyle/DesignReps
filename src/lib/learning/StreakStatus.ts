/** Whether today's lesson is done, still needed to keep the streak, or there's no streak to keep. */
export type StreakState = "doneToday" | "atRisk" | "none";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The streak as the player should see it today.
 *
 * The database only updates the streak when a lesson is completed, so after
 * a missed day the stored `streak_current` is out of date until the next
 * completion. This class applies the server's rule to "today" so the app
 * never shows a streak that's already broken:
 *   last active today (or later, after travelling west) → stored streak, done today
 *   last active yesterday → stored streak, at risk until a lesson today
 *   earlier, or never → 0
 * The longest streak is shown as stored.
 */
export class StreakStatus {
  private constructor(
    readonly current: number,
    readonly longest: number,
    readonly state: StreakState,
  ) {}

  /**
   * @param stored - The `users` row values.
   * @param today - The player's calendar day, `YYYY-MM-DD`, in their time zone.
   * @throws {RangeError} if a date isn't `YYYY-MM-DD`.
   */
  static of(stored: { current: number; longest: number; lastActiveDate: string | null }, today: string): StreakStatus {
    if (stored.lastActiveDate === null || stored.current === 0) return new StreakStatus(0, stored.longest, "none");

    const gap = StreakStatus.daysBetween(stored.lastActiveDate, today);
    if (gap <= 0) return new StreakStatus(stored.current, stored.longest, "doneToday");
    if (gap === 1) return new StreakStatus(stored.current, stored.longest, "atRisk");
    return new StreakStatus(0, stored.longest, "none");
  }

  /** Today's date (`YYYY-MM-DD`) in an IANA time zone. */
  static today(timeZone: string, now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  /** Whole days from `from` to `to` (negative if `to` is earlier). */
  private static daysBetween(from: string, to: string): number {
    return (StreakStatus.toUtcMs(to) - StreakStatus.toUtcMs(from)) / MS_PER_DAY;
  }

  private static toUtcMs(isoDate: string): number {
    const match = ISO_DATE.exec(isoDate);
    if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${isoDate}`);
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
}
