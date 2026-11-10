// src/hooks/useTeenPattiGame.ts

import { useEffect, useCallback, useMemo } from 'react';
import type { GameState, Player, Entity } from '../types/gameTypes';
import { loadStateFromLocalStorage, saveStateToLocalStorage } from '../utils/localStorage';
import { toTitleCase } from '../utils/formatters';
import { useUndo } from './useUndo';
import { useGameState } from './useGameState';
import { useEngineIo } from './useEngineIo';
import { teenPattiSettlement } from '../utils/gameSettlement';
import { archiveOrWarn } from '../utils/archive';
import { rememberPlayers } from '../utils/savedPlayers';
import { betRefusal, bootRefusal, nextBoot } from '../utils/teenPattiRules';
import type { TeenPattiSettings } from '../utils/gameSettings';
import * as engine from './teenPattiEngine';
import type { Io } from '../utils/engine';

export const derivePlayers = engine.derivePlayers;

export const useTeenPattiGame = () => {
  const [gameState, setGameState, log, afterCommit] = useGameState<GameState>(() => {
    return loadStateFromLocalStorage() || engine.createInitialGameState();
  }, engine.roundMoney);

  const { record, undo, canUndo } = useUndo(gameState, setGameState, gameState.roundActive);
  const io = useEngineIo(log, afterCommit, 'teen-patti');
  const step = (fn: (s: GameState, io: Io) => GameState) => setGameState(prev => fn(prev, io));

  // --- Persistence ---
  useEffect(() => {
    saveStateToLocalStorage(gameState);
  }, [gameState]);

  const addMessage = useCallback((message: string, isError: boolean = false) => {
    log(`${isError ? "ERROR: " : ""}${message}`);
  }, [log]);

  // --- DERIVED STATE ---
  const { players, foldedPlayerIds, roundActive, currentPlayerIndex } = gameState;
  const { activePlayers, currentPlayer, precedingPlayer } = useMemo(
    () => engine.derivePlayers({ players, foldedPlayerIds, roundActive, currentPlayerIndex }),
    [players, foldedPlayerIds, roundActive, currentPlayerIndex]
  );

  const endRound = (winner: Player | null) => step((s, io) => engine.endRound(s, winner?.id ?? null, io));

  const startNewGame = (newPlayers: Player[], settings: TeenPattiSettings = {}) => {
    setGameState(prev => {
      afterCommit(() => archiveOrWarn('teen-patti', prev.stats, teenPattiSettlement(prev)));
      return engine.newGame(newPlayers, settings, Date.now());
    });
    const full = rememberPlayers(newPlayers.map(p => ({ name: p.name, phone: p.phoneNumber })));
    if (full) addMessage(full);
  };

  // Empties the game without saving it to history (used after handing the game to another phone).
  const clearGame = () => setGameState(engine.createInitialGameState());

  const applySettings = (settings: TeenPattiSettings) => step((s, io) => engine.applySettings(s, settings, io));

  const loadGame = () => {
    const loadedState = loadStateFromLocalStorage();
    if (loadedState) {
      // Ensure new properties are initialized if loading old state
      loadedState.players = loadedState.players.map(p => ({ ...p, isTakingBreak: p.isTakingBreak || false }));
      setGameState(loadedState);
      addMessage("Saved game loaded.");
      return true;
    }
    addMessage("No valid saved game found.", true);
    return false;
  };

  const startRound = (startingPlayerIndex: number, bootAmount: number): string | null => {
    const bootRefused = bootRefusal(gameState, nextBoot(gameState, bootAmount));
    if (bootRefused) {
      addMessage(bootRefused, true);
      return bootRefused;
    }
    localStorage.setItem('poker-notes', "Game \nBUST - \nJOKER - ");
    step((s, io) => engine.startRound(s, startingPlayerIndex, bootAmount, io));
    return null;
  };

  // Bet actions return the table-rule refusal, or null.
  const refuse = (kind: 'blind' | 'chaal' | 'show', amount: number, player: Player) => {
    const refusal = betRefusal(gameState, kind, amount, toTitleCase(player.name), gameState.blindTurns?.[player.id] ?? 0, gameState.blindPlayerIds.has(player.id));
    if (refusal) addMessage(refusal, true);
    return refusal;
  };

  const playBlind = (isRaise: boolean, amount: number): string | null => {
    if (!currentPlayer || !gameState.blindPlayerIds.has(currentPlayer.id)) return null;
    const refusal = refuse('blind', amount, currentPlayer);
    if (refusal) return refusal;
    step(s => engine.playBlind(s, isRaise, amount));
    return null;
  };

  const seeCards = () => step(s => engine.seeCards(s));

  const betChaal = (amount: number): string | null => {
    if (!currentPlayer || gameState.blindPlayerIds.has(currentPlayer.id)) return null;
    const refusal = refuse('chaal', amount, currentPlayer);
    if (refusal) return refusal;
    step(s => engine.betChaal(s, amount));
    return null;
  };

  const fold = () => step((s, io) => engine.fold(s, io));

  const requestShow = (cost: number): string | null => {
    if (!currentPlayer) return null;
    const refusal = refuse('show', cost, currentPlayer);
    if (refusal) return refusal;
    step(s => engine.requestShow(s, cost));
    return null;
  };

  const resolveShow = (loserId: number) => step((s, io) => engine.resolveShow(s, loserId, io));

  const addPlayer = (name: string, balance: number, phoneNumber: string) => {
    step((s, io) => engine.addPlayer(s, name, balance, phoneNumber, io));
    const full = rememberPlayers([{ name: toTitleCase(name), phone: phoneNumber }]);
    if (full) addMessage(full);
  };

  const removePlayer = (playerId: number) => step((s, io) => engine.removePlayer(s, playerId, io));
  const reorderPlayers = (reordered: Player[]) => step(s => engine.reorderPlayers(s, reordered));
  const updateEntities = (entities: Entity[]) => step(s => engine.updateEntities(s, entities));
  const updatePlayers = (players: Player[]) => step(s => engine.updatePlayers(s, players));
  const deductAndDistribute = (playerId: number, amount: number) => step((s, io) => engine.deductAndDistribute(s, playerId, amount, io));
  const togglePlayerBreak = (playerId: number) => step((s, io) => engine.togglePlayerBreak(s, playerId, io));
  // Final Owings' picker: kept with the game (and its History entry), not an undo step.
  const setSettleThrough = (label: string | null) => setGameState(s => ({ ...s, settleThrough: label }));

  return {
    gameState,
    addMessage,
    activePlayers,
    currentPlayer,
    precedingPlayer,
    undo,
    canUndo,
    actions: {
      setSettleThrough,
      ...record({
      startNewGame,
      loadGame,
      startRound,
      playBlind,
      seeCards,
      betChaal,
      fold,
      requestShow,
      resolveShow,
      endRound,
      addPlayer,
      removePlayer,
      reorderPlayers,
      deductAndDistribute,
      updateEntities,
      updatePlayers,
      togglePlayerBreak,
      clearGame,
      applySettings,
    }),
    },
  };
};
