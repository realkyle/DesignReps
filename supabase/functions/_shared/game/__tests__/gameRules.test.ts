import {
  type Completion,
  createGameRules,
  LessonUnlocker,
  LevelTable,
  LocalDate,
  type PlayerState,
  Streak,
  XpPolicy,
} from "../index.ts";

const LA = "America/Los_Angeles";
const rules = createGameRules();

/** Noon in Los Angeles on the given day, so the date is unambiguous. */
const noonLA = (isoDate: string) => new Date(`${isoDate}T19:00:00Z`);

function newPlayer(totalXp = 0, streak = Streak.empty()): PlayerState {
  return { totalXp, streak };
}

function complete(overrides: Partial<Completion> = {}): Completion {
  return { kind: "lesson", alreadyCompleted: false, completedAt: noonLA("2026-10-27"), timeZone: LA, ...overrides };
}

describe("XP (contract: 10 per lesson, 25 per scenario, 0 for repeats)", () => {
  it("awards 10 XP for a first lesson completion", () => {
    expect(rules.applyCompletion(newPlayer(), complete()).xpAwarded).toBe(10);
  });

  it("awards 25 XP for a first scenario completion", () => {
    expect(rules.applyCompletion(newPlayer(), complete({ kind: "scenario" })).xpAwarded).toBe(25);
  });

  it.each(["lesson", "scenario"] as const)("awards 0 XP for a repeated %s", (kind) => {
    const outcome = rules.applyCompletion(newPlayer(30), complete({ kind, alreadyCompleted: true }));
    expect(outcome.xpAwarded).toBe(0);
    expect(outcome.totalXp).toBe(30);
  });

  it("adds the award to the running total", () => {
    expect(rules.applyCompletion(newPlayer(30), complete()).totalXp).toBe(40);
  });

  it("caps the MVP track at 105 XP (8 lessons + 1 scenario)", () => {
    let player = newPlayer();
    for (let day = 1; day <= 8; day++) {
      player = rules.applyCompletion(player, complete({ completedAt: noonLA(`2026-11-0${day}`) })).nextState;
    }
    player = rules.applyCompletion(player, complete({ kind: "scenario", completedAt: noonLA("2026-11-09") })).nextState;
    expect(player.totalXp).toBe(105);
  });
});

describe("Levels (thresholds 0 / 20 / 40 / 70 / 100)", () => {
  it.each([
    [0, 1],
    [19, 1],
    [20, 2],
    [39, 2],
    [40, 3],
    [70, 4],
    [100, 5],
    [105, 5],
  ])("%i XP is level %i", (xp, level) => {
    expect(rules.levelFor(xp)).toBe(level);
  });

  it("reports a level-up when a completion crosses a threshold", () => {
    const outcome = rules.applyCompletion(newPlayer(10), complete());
    expect(outcome.level).toEqual({ current: 2, leveledUp: true, nextLevelXp: 40 });
  });

  it("reports no level-up within a level", () => {
    expect(rules.applyCompletion(newPlayer(20), complete()).level).toEqual({
      current: 2,
      leveledUp: false,
      nextLevelXp: 40,
    });
  });

  it("has no next level at level 5", () => {
    const outcome = rules.applyCompletion(newPlayer(80), complete({ kind: "scenario" }));
    expect(outcome.level).toEqual({ current: 5, leveledUp: true, nextLevelXp: null });
  });

  it("rejects thresholds that don't start at 0 or don't increase", () => {
    expect(() => new LevelTable([10, 20])).toThrow(RangeError);
    expect(() => new LevelTable([0, 20, 20])).toThrow(RangeError);
  });

  it("rejects negative or fractional XP", () => {
    expect(() => rules.levelFor(-1)).toThrow(RangeError);
    expect(() => rules.levelFor(1.5)).toThrow(RangeError);
  });
});

describe("Streak (same day → unchanged, next day → +1, gap → 1)", () => {
  const streakOn = (isoDate: string, current: number, longest = current) =>
    Streak.restore(current, longest, LocalDate.parse(isoDate));

  it("starts at 1 on the first ever completion", () => {
    expect(rules.applyCompletion(newPlayer(), complete()).streak).toEqual({
      current: 1,
      longest: 1,
      extendedToday: true,
    });
  });

  it("is unchanged by a second completion the same day", () => {
    const outcome = rules.applyCompletion(newPlayer(10, streakOn("2026-10-27", 3)), complete());
    expect(outcome.streak).toEqual({ current: 3, longest: 3, extendedToday: false });
  });

  it("goes up by 1 on the next day", () => {
    const outcome = rules.applyCompletion(newPlayer(10, streakOn("2026-10-26", 3)), complete());
    expect(outcome.streak).toEqual({ current: 4, longest: 4, extendedToday: true });
  });

  it("resets to 1 after a missed day", () => {
    const outcome = rules.applyCompletion(newPlayer(10, streakOn("2026-10-25", 3)), complete());
    expect(outcome.streak.current).toBe(1);
  });

  it("keeps the longest streak after a reset", () => {
    const outcome = rules.applyCompletion(newPlayer(10, streakOn("2026-10-20", 2, 5)), complete());
    expect(outcome.streak).toEqual({ current: 1, longest: 5, extendedToday: true });
  });

  it("counts a repeated lesson toward the streak (practice keeps it alive)", () => {
    const outcome = rules.applyCompletion(
      newPlayer(10, streakOn("2026-10-26", 3)),
      complete({ alreadyCompleted: true }),
    );
    expect(outcome.streak.current).toBe(4);
    expect(outcome.xpAwarded).toBe(0);
  });

  it("uses the user's time zone for the day boundary", () => {
    // 05:30 UTC on Oct 28 is still the evening of Oct 27 in Los Angeles.
    const lateEveningLA = new Date("2026-10-28T05:30:00Z");
    const player = newPlayer(10, streakOn("2026-10-27", 3));
    expect(rules.applyCompletion(player, complete({ completedAt: lateEveningLA, timeZone: LA })).streak.current).toBe(3);
    expect(rules.applyCompletion(player, complete({ completedAt: lateEveningLA, timeZone: "UTC" })).streak.current).toBe(4);
  });

  it("treats a date earlier than the last active day (travelling west) as the same day", () => {
    const outcome = rules.applyCompletion(newPlayer(10, streakOn("2026-10-28", 3)), complete());
    expect(outcome.streak).toEqual({ current: 3, longest: 3, extendedToday: false });
  });

  it("returns the new state to save, without changing the old one", () => {
    const before = streakOn("2026-10-26", 3);
    const outcome = rules.applyCompletion(newPlayer(10, before), complete());
    expect(outcome.nextState.streak.lastActiveDate?.toString()).toBe("2026-10-27");
    expect(before.current).toBe(3);
  });

  it("rejects inconsistent stored values", () => {
    expect(() => Streak.restore(3, 2, LocalDate.parse("2026-10-27"))).toThrow(RangeError);
    expect(() => Streak.restore(2, 2, null)).toThrow(RangeError);
    expect(() => Streak.restore(0, 0, LocalDate.parse("2026-10-27"))).toThrow(RangeError);
  });
});

describe("LocalDate", () => {
  it("rejects an unknown time zone (contract error 400)", () => {
    expect(LocalDate.isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(() => rules.applyCompletion(newPlayer(), complete({ timeZone: "Mars/Olympus_Mons" }))).toThrow(RangeError);
  });

  it("round-trips the Postgres date format and rejects impossible dates", () => {
    expect(LocalDate.parse("2026-02-28").toString()).toBe("2026-02-28");
    expect(() => LocalDate.parse("2026-02-30")).toThrow(RangeError);
    expect(() => LocalDate.parse("10/27/2026")).toThrow(RangeError);
  });

  it("counts days across a month boundary", () => {
    expect(LocalDate.parse("2026-11-01").daysSince(LocalDate.parse("2026-10-31"))).toBe(1);
  });
});

describe("Unlocking (lesson n opens after lesson n − 1)", () => {
  const track = new LessonUnlocker([
    { id: "l1", position: 1 },
    { id: "l2", position: 2 },
    { id: "l3", position: 3 },
  ]);

  it("always unlocks the first lesson", () => {
    expect(track.isUnlocked(1, new Set())).toBe(true);
  });

  it("locks lesson 2 until lesson 1 is completed (contract error 403)", () => {
    expect(track.isUnlocked(2, new Set())).toBe(false);
    expect(track.prerequisiteFor(2)).toEqual({ id: "l1", position: 1 });
    expect(track.isUnlocked(2, new Set(["l1"]))).toBe(true);
  });

  it("unlocks the next lesson on a first completion", () => {
    expect(track.unlockedBy(1, false)).toEqual({ id: "l2", position: 2 });
  });

  it("unlocks nothing after the last lesson", () => {
    expect(track.unlockedBy(3, false)).toBeNull();
  });

  it("unlocks nothing on a repeat", () => {
    expect(track.unlockedBy(1, true)).toBeNull();
  });

  it("rejects tracks with gaps or duplicate positions", () => {
    expect(() => new LessonUnlocker([{ id: "a", position: 1 }, { id: "b", position: 3 }])).toThrow(RangeError);
    expect(() => new LessonUnlocker([{ id: "a", position: 1 }, { id: "b", position: 1 }])).toThrow(RangeError);
  });
});

describe("XpPolicy", () => {
  it("uses the values it is given (so XP can be rescaled without code changes)", () => {
    expect(new XpPolicy({ lesson: 100, scenario: 250 }).xpFor("scenario", false)).toBe(250);
  });
});
