// src/utils/localStorage.ts

import { LOCAL_STORAGE_KEY } from '../constants/gameConstants';
import type { GameState } from '../types/gameTypes';

export const saveStateToLocalStorage = (state: GameState) => {
  const stateToSave = {
    ...state,
    foldedPlayerIds: Array.from(state.foldedPlayerIds),
    blindPlayerIds: Array.from(state.blindPlayerIds),
    roundContributions: Array.from(state.roundContributions.entries()),
  };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
};

export const loadStateFromLocalStorage = (): GameState | null => {
  const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!savedState) return null;

  try {
    const parsed = JSON.parse(savedState);
    if (!parsed.players || parsed.players.length < 2) {
      console.warn("Loaded game has invalid player data. Starting fresh.");
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return null;
    }

    return {
      ...parsed,
      foldedPlayerIds: new Set(parsed.foldedPlayerIds || []),
      blindPlayerIds: new Set(parsed.blindPlayerIds || []),
      roundContributions: new Map(parsed.roundContributions || []),
    };
  } catch (error) {
    console.error("Failed to parse saved state from localStorage:", error);
    return null;
  }
};