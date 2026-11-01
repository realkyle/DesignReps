import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { learningRepository, type LessonPath, type PlayerSummary } from "@/lib/learning";

export interface LessonPathState {
  path: LessonPath | null;
  player: PlayerSummary | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
}

/**
 * Loads the lesson path and the player's stats, and reloads them every time
 * the home screen comes back into focus (e.g. after finishing a lesson), so
 * new XP and unlocked lessons show up without a manual refresh.
 */
export function useLessonPath(): LessonPathState {
  const [path, setPath] = useState<LessonPath | null>(null);
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([learningRepository.loadPath(), learningRepository.loadPlayer()]).then(([pathResult, playerResult]) => {
      if (cancelled) return;
      if (pathResult.ok) setPath(pathResult.value);
      if (playerResult.ok) setPlayer(playerResult.value);
      setError(pathResult.ok ? null : pathResult.message);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(reload);

  return { path, player, error, isLoading, reload };
}
