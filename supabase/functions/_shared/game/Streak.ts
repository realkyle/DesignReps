import { LocalDate } from "./LocalDate.ts";

/** Result of recording a day of activity. */
export interface StreakUpdate {
  streak: Streak;
  /** True if this was the first activity of the day, so the streak changed. */
  extendedToday: boolean;
}

/**
 * A daily streak: consecutive calendar days with at least one completion.
 *
 * Immutable: `recordActivity` returns a new Streak instead of changing this
 * one, so a failed request can never leave a half-updated streak in memory.
 */
export class Streak {
  private constructor(
    readonly current: number,
    readonly longest: number,
    readonly lastActiveDate: LocalDate | null,
  ) {}

  /** A player who has never completed anything. */
  static empty(): Streak {
    return new Streak(0, 0, null);
  }

  /**
   * Rebuilds a streak from stored values (the `users` row).
   *
   * @throws {RangeError} if the values are inconsistent.
   */
  static restore(current: number, longest: number, lastActiveDate: LocalDate | null): Streak {
    if (!Number.isInteger(current) || current < 0 || !Number.isInteger(longest) || longest < current) {
      throw new RangeError(`Invalid streak: current ${current}, longest ${longest}`);
    }
    if ((lastActiveDate === null) !== (current === 0)) {
      throw new RangeError("A streak has a last active date exactly when current > 0");
    }
    return new Streak(current, longest, lastActiveDate);
  }

  /**
   * Applies the contract's streak rule for activity on `today`:
   * same day → unchanged; the next day → +1; a gap (or first ever) → 1.
   *
   * If `today` is EARLIER than the last active date (the user travelled west
   * across a date line, or changed their time zone), it counts as the same
   * day: nothing changes, and the request doesn't fail.
   */
  recordActivity(today: LocalDate): StreakUpdate {
    if (this.lastActiveDate === null) return this.extendTo(1, today);

    const gap = today.daysSince(this.lastActiveDate);
    if (gap <= 0) return { streak: this, extendedToday: false };
    return this.extendTo(gap === 1 ? this.current + 1 : 1, today);
  }

  private extendTo(current: number, today: LocalDate): StreakUpdate {
    return {
      streak: new Streak(current, Math.max(this.longest, current), today),
      extendedToday: true,
    };
  }
}
