/**
 * Maps total XP to a level, from a list of thresholds.
 *
 * Thresholds are data, not code: rescaling levels when new tracks add more
 * XP means passing a different list, not editing logic.
 */
export class LevelTable {
  private readonly thresholds: readonly number[];

  /**
   * @param thresholds - Total XP needed for each level, starting with level 1.
   *   Must start at 0 and strictly increase.
   * @throws {RangeError} if the thresholds are empty, don't start at 0, or don't increase.
   */
  constructor(thresholds: readonly number[]) {
    if (thresholds.length === 0 || thresholds[0] !== 0) {
      throw new RangeError("Level thresholds must start at 0 XP");
    }
    for (let i = 1; i < thresholds.length; i++) {
      if (thresholds[i] <= thresholds[i - 1]) {
        throw new RangeError("Level thresholds must strictly increase");
      }
    }
    this.thresholds = [...thresholds];
  }

  /** The highest level a player can reach. */
  get maxLevel(): number {
    return this.thresholds.length;
  }

  /** Level (1-based) for a total XP amount. */
  levelFor(totalXp: number): number {
    if (!Number.isInteger(totalXp) || totalXp < 0) {
      throw new RangeError(`XP must be a non-negative integer (got ${totalXp})`);
    }
    let level = 1;
    while (level < this.thresholds.length && totalXp >= this.thresholds[level]) level++;
    return level;
  }

  /** Total XP needed to reach the level after `level`, or null at the max level. */
  nextLevelXp(level: number): number | null {
    return level >= this.maxLevel ? null : this.thresholds[level];
  }
}
