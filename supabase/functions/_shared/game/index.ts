import { GameRules } from "./GameRules.ts";
import { LevelTable } from "./LevelTable.ts";
import { XpPolicy } from "./XpPolicy.ts";

export { type Completion, type CompletionOutcome, GameRules, type PlayerState } from "./GameRules.ts";
export { LessonUnlocker, type OrderedLesson } from "./LessonUnlocker.ts";
export { LevelTable } from "./LevelTable.ts";
export { LocalDate } from "./LocalDate.ts";
export { Streak, type StreakUpdate } from "./Streak.ts";
export { type LessonKind, XpPolicy, type XpValues } from "./XpPolicy.ts";

/** XP per first completion (contract: 10 per lesson, 25 per scenario). */
export const XP_VALUES = { lesson: 10, scenario: 25 } as const;

/**
 * Total XP to reach levels 1–5, sized for the MVP track's 105-XP maximum
 * (8 × 10 + 25). Confirmed Oct 18, 2026; rescale when tracks are added.
 */
export const LEVEL_THRESHOLDS = [0, 20, 40, 70, 100] as const;

/** The production rule set. */
export function createGameRules(): GameRules {
  return new GameRules(new XpPolicy(XP_VALUES), new LevelTable(LEVEL_THRESHOLDS));
}
