/**
 * Total XP at which each level starts (level 1 starts at 0).
 *
 * Mirrors `c_levels` in the complete_lesson SQL function, which is the source
 * of truth. A test reads the newest migration and fails if these drift.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [0, 20, 40, 70, 100];

/**
 * How far a player is through their current level, for the progress bar.
 *
 * Display only: the level is derived from XP the same way the server does it,
 * and the server stays the authority on XP and levels.
 */
export class LevelProgress {
  private constructor(
    /** Total XP. */
    readonly xp: number,
    /** Current level (1-based). */
    readonly level: number,
    /** Total XP at which the current level started. */
    readonly levelStartXp: number,
    /** Total XP needed for the next level, or null at the max level. */
    readonly nextLevelXp: number | null,
  ) {}

  /**
   * @param xp - The player's total XP.
   * @param thresholds - Level start values; defaults to {@link LEVEL_THRESHOLDS}.
   * @throws {RangeError} if `xp` isn't a non-negative integer.
   */
  static of(xp: number, thresholds: readonly number[] = LEVEL_THRESHOLDS): LevelProgress {
    if (!Number.isInteger(xp) || xp < 0) throw new RangeError(`XP must be a non-negative integer (got ${xp})`);
    let level = 1;
    while (level < thresholds.length && xp >= thresholds[level]) level++;
    const next = level < thresholds.length ? thresholds[level] : null;
    return new LevelProgress(xp, level, thresholds[level - 1], next);
  }

  get isMaxLevel(): boolean {
    return this.nextLevelXp === null;
  }

  /** XP still needed for the next level (0 at the max level). */
  get xpToNextLevel(): number {
    return this.nextLevelXp === null ? 0 : this.nextLevelXp - this.xp;
  }

  /** Progress through the current level, from 0 to 1 (1 at the max level). */
  get fraction(): number {
    if (this.nextLevelXp === null) return 1;
    return (this.xp - this.levelStartXp) / (this.nextLevelXp - this.levelStartXp);
  }
}
