const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A calendar day (no time, no zone), e.g. 2026-10-27.
 *
 * Streaks are about the user's days, not the server's: a lesson at 11 pm in
 * Seattle is "today" for the user even though it's already tomorrow in UTC.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  /**
   * The calendar day of `instant` in `timeZone`.
   *
   * @throws {RangeError} if `timeZone` isn't a valid IANA name.
   */
  static of(instant: Date, timeZone: string): LocalDate {
    if (!LocalDate.isValidTimeZone(timeZone)) {
      throw new RangeError(`Unknown time zone: ${timeZone}`);
    }
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const get = (type: "year" | "month" | "day") => Number(parts.find((p) => p.type === type)?.value);
    return new LocalDate(get("year"), get("month"), get("day"));
  }

  /** Parses `YYYY-MM-DD` (the Postgres `date` format). */
  static parse(isoDate: string): LocalDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${isoDate}`);
    const date = new LocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date.toString() !== new Date(date.utcMidnight()).toISOString().slice(0, 10)) {
      throw new RangeError(`Not a real calendar date: ${isoDate}`);
    }
    return date;
  }

  /** True for IANA names the runtime knows, e.g. "America/Los_Angeles" or "UTC". */
  static isValidTimeZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  /** Whole days from `earlier` to this date (negative if `earlier` is later). */
  daysSince(earlier: LocalDate): number {
    return Math.round((this.utcMidnight() - earlier.utcMidnight()) / MS_PER_DAY);
  }

  equals(other: LocalDate): boolean {
    return this.daysSince(other) === 0;
  }

  /** `YYYY-MM-DD`, ready to store in a Postgres `date` column. */
  toString(): string {
    const pad = (n: number, width: number) => String(n).padStart(width, "0");
    return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  private utcMidnight(): number {
    return Date.UTC(this.year, this.month - 1, this.day);
  }
}
