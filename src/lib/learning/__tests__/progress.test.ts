/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { LearningRepository } from "../LearningRepository";
import { LEVEL_THRESHOLDS, LevelProgress } from "../LevelProgress";
import { StreakStatus } from "../StreakStatus";

// ---------------------------------------------------------------------------
// LevelProgress
// ---------------------------------------------------------------------------
describe("LevelProgress", () => {
  it("a new player is level 1 with 0 of 20 XP", () => {
    const level = LevelProgress.of(0);
    expect([level.level, level.levelStartXp, level.nextLevelXp, level.xpToNextLevel, level.fraction]).toEqual([1, 0, 20, 20, 0]);
  });

  it("partway through a level", () => {
    const level = LevelProgress.of(55); // level 3 runs 40 → 70
    expect([level.level, level.levelStartXp, level.nextLevelXp, level.xpToNextLevel]).toEqual([3, 40, 70, 15]);
    expect(level.fraction).toBeCloseTo(0.5);
  });

  it("reaching a threshold exactly moves up a level, with an empty bar", () => {
    const level = LevelProgress.of(20);
    expect([level.level, level.fraction]).toEqual([2, 0]);
  });

  it("at or past the last threshold is the max level, with a full bar", () => {
    for (const xp of [100, 250]) {
      const level = LevelProgress.of(xp);
      expect([level.level, level.isMaxLevel, level.nextLevelXp, level.xpToNextLevel, level.fraction]).toEqual([5, true, null, 0, 1]);
    }
  });

  it("rejects negative or fractional XP", () => {
    expect(() => LevelProgress.of(-1)).toThrow(RangeError);
    expect(() => LevelProgress.of(1.5)).toThrow(RangeError);
  });

  it("matches the thresholds in the newest complete_lesson migration (the source of truth)", () => {
    const dir = resolve(__dirname, "../../../../supabase/migrations");
    const newest = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .filter((sql) => sql.includes("c_levels"))
      .at(-1);
    const match = /c_levels\s+constant\s+integer\[\]\s*:=\s*array\[([^\]]+)\]/.exec(newest ?? "");
    expect(match).not.toBeNull();
    expect(match![1].split(",").map((value) => Number(value.trim()))).toEqual(LEVEL_THRESHOLDS);
  });
});

// ---------------------------------------------------------------------------
// StreakStatus
// ---------------------------------------------------------------------------
describe("StreakStatus", () => {
  const stored = (current: number, longest: number, lastActiveDate: string | null) => ({ current, longest, lastActiveDate });

  it("last active today → stored streak, done today", () => {
    const streak = StreakStatus.of(stored(3, 5, "2026-11-11"), "2026-11-11");
    expect([streak.current, streak.longest, streak.state]).toEqual([3, 5, "doneToday"]);
  });

  it("last active yesterday → stored streak, at risk", () => {
    const streak = StreakStatus.of(stored(3, 5, "2026-11-10"), "2026-11-11");
    expect([streak.current, streak.state]).toEqual([3, "atRisk"]);
  });

  it("a missed day → 0, but the longest streak is kept", () => {
    const streak = StreakStatus.of(stored(3, 5, "2026-11-09"), "2026-11-11");
    expect([streak.current, streak.longest, streak.state]).toEqual([0, 5, "none"]);
  });

  it("counts calendar days across a month and year boundary", () => {
    expect(StreakStatus.of(stored(2, 2, "2026-12-31"), "2027-01-01").state).toBe("atRisk");
    expect(StreakStatus.of(stored(2, 2, "2026-02-28"), "2026-03-01").state).toBe("atRisk");
  });

  it("a last active date after today (travelled west) counts as today, like the server", () => {
    expect(StreakStatus.of(stored(4, 4, "2026-11-12"), "2026-11-11").state).toBe("doneToday");
  });

  it("never active → no streak", () => {
    const streak = StreakStatus.of(stored(0, 0, null), "2026-11-11");
    expect([streak.current, streak.longest, streak.state]).toEqual([0, 0, "none"]);
  });

  it("today() uses the given time zone's calendar day", () => {
    const instant = new Date("2026-11-11T05:30:00Z"); // still Nov 10 in Seattle
    expect(StreakStatus.today("America/Los_Angeles", instant)).toBe("2026-11-10");
    expect(StreakStatus.today("Asia/Tokyo", instant)).toBe("2026-11-11");
  });

  it("rejects a malformed date", () => {
    expect(() => StreakStatus.of(stored(1, 1, "11/10/2026"), "2026-11-11")).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// LearningRepository.loadPlayer
// ---------------------------------------------------------------------------
interface FakeQuery {
  select: jest.Mock<FakeQuery, [string]>;
  maybeSingle: jest.Mock<Promise<{ data: unknown; error: unknown }>, []>;
}

function fakeClient(result: { data: unknown; error: unknown }) {
  const query: FakeQuery = {
    select: jest.fn((_columns: string) => query),
    maybeSingle: jest.fn(async () => result),
  };
  const client = { from: jest.fn(() => query) };
  return { client: client as unknown as SupabaseClient<Database>, query };
}

describe("LearningRepository.loadPlayer", () => {
  it("builds level progress and today's streak from the user's row", async () => {
    const { client, query } = fakeClient({
      data: { xp: 45, streak_current: 2, streak_longest: 6, last_active_date: "2026-11-10" },
      error: null,
    });
    const result = await new LearningRepository(client, () => "2026-11-11").loadPlayer();

    expect(query.select).toHaveBeenCalledWith("xp, streak_current, streak_longest, last_active_date");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.value.level.level, result.value.level.nextLevelXp]).toEqual([3, 70]);
    expect([result.value.streak.current, result.value.streak.longest, result.value.streak.state]).toEqual([2, 6, "atRisk"]);
  });

  it("shows a broken streak as 0 even though the stored value is stale", async () => {
    const { client } = fakeClient({
      data: { xp: 10, streak_current: 4, streak_longest: 4, last_active_date: "2026-11-01" },
      error: null,
    });
    const result = await new LearningRepository(client, () => "2026-11-11").loadPlayer();
    expect(result.ok && result.value.streak.current).toBe(0);
  });

  it("returns a message instead of throwing on a query error or missing row", async () => {
    for (const response of [{ data: null, error: { message: "boom" } }, { data: null, error: null }]) {
      const { client } = fakeClient(response);
      const result = await new LearningRepository(client, () => "2026-11-11").loadPlayer();
      expect(result.ok).toBe(false);
    }
  });

  it("returns a message instead of throwing on a bad stored date", async () => {
    const { client } = fakeClient({
      data: { xp: 10, streak_current: 1, streak_longest: 1, last_active_date: "not-a-date" },
      error: null,
    });
    const result = await new LearningRepository(client, () => "2026-11-11").loadPlayer();
    expect(result.ok).toBe(false);
  });
});
