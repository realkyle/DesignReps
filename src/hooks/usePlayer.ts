import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { learningRepository, type PlayerSummary } from "@/lib/learning";

export interface PlayerState {
  player: PlayerSummary | null;
  error: string | null;
  reload: () => void;
}

/** Loads the player's level and streak, and reloads them whenever the screen comes into focus. */
export function usePlayer(): PlayerState {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    learningRepository.loadPlayer().then((result) => {
      if (cancelled) return;
      if (result.ok) setPlayer(result.value);
      setError(result.ok ? null : result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(reload);

  return { player, error, reload };
}
