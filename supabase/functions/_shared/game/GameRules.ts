import { LevelTable } from "./LevelTable.ts";
import { LocalDate } from "./LocalDate.ts";
import { Streak } from "./Streak.ts";
import { type LessonKind, XpPolicy } from "./XpPolicy.ts";

/** A player's game state before a completion (from the `users` row). */
export interface PlayerState {
  totalXp: number;
  streak: Streak;
}

/** One lesson completion to apply. */
export interface Completion {
  kind: LessonKind;
  /** True if the user finished this lesson before (repeat = practice, no XP). */
  alreadyCompleted: boolean;
  completedAt: Date;
  /** IANA time zone from the request; decides which calendar day this counts for. */
  timeZone: string;
}

/** Everything a completion changes, shaped like the API contract's response. */
export interface CompletionOutcome {
  xpAwarded: number;
  totalXp: number;
  level: { current: number; leveledUp: boolean; nextLevelXp: number | null };
  streak: { current: number; longest: number; extendedToday: boolean };
  /** The new state, ready to save back to the `users` row. */
  nextState: PlayerState;
}

/**
 * The game rules from api/complete-lesson.md, in one place: XP, levels and
 * daily streaks. Pure and deterministic (no database, no clock), so every
 * rule is unit tested and the Edge Function only has to load state, call
 * `applyCompletion`, and save the result.
 */
export class GameRules {
  constructor(
    private readonly xpPolicy: XpPolicy,
    private readonly levels: LevelTable,
  ) {}

  /** The level for a total XP amount (levels are always derived from XP, never trusted from storage). */
  levelFor(totalXp: number): number {
    return this.levels.levelFor(totalXp);
  }

  /**
   * Applies one completion to a player's state.
   *
   * @throws {RangeError} if the time zone is invalid or the stored XP is.
   */
  applyCompletion(player: PlayerState, completion: Completion): CompletionOutcome {
    const today = LocalDate.of(completion.completedAt, completion.timeZone);

    const xpAwarded = this.xpPolicy.xpFor(completion.kind, completion.alreadyCompleted);
    const totalXp = player.totalXp + xpAwarded;
    const previousLevel = this.levels.levelFor(player.totalXp);
    const currentLevel = this.levels.levelFor(totalXp);

    const { streak, extendedToday } = player.streak.recordActivity(today);

    return {
      xpAwarded,
      totalXp,
      level: {
        current: currentLevel,
        leveledUp: currentLevel > previousLevel,
        nextLevelXp: this.levels.nextLevelXp(currentLevel),
      },
      streak: { current: streak.current, longest: streak.longest, extendedToday },
      nextState: { totalXp, streak },
    };
  }
}
