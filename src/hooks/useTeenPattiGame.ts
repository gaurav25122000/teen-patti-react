// src/hooks/useTeenPattiGame.ts

import { useState, useEffect, useCallback } from 'react';
import type { GameState, Player } from '../types/gameTypes';
import { loadStateFromLocalStorage, saveStateToLocalStorage } from '../utils/localStorage';
import { toTitleCase } from '../utils/formatters';

const createInitialGameState = (): GameState => ({
  players: [],
  lastWinnerId: null,
  roundActive: false,
  currentPlayerIndex: -1,
  currentStake: 0,
  potAmount: 0,
  foldedPlayerIds: new Set<number>(),
  blindPlayerIds: new Set<number>(),
  lastActorWasBlind: false,
  roundInitialBootAmount: null,
  roundContributions: new Map<number, number>(),
  messages: ["Welcome! Load a game or set up a new one."],
});

export const useTeenPattiGame = () => {
  const [gameState, setGameState] = useState<GameState>(() => {
    return loadStateFromLocalStorage() || createInitialGameState();
  });

  // --- Persistence ---
  useEffect(() => {
    saveStateToLocalStorage(gameState);
  }, [gameState]);

  // --- Utility Functions ---
  const addMessage = useCallback((message: string, isError: boolean = false) => {
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages.slice(-100), `${isError ? "ERROR: " : ""}${message}`]
    }));
  }, []);

  // --- Derived State Calculation ---
  const getActivePlayers = useCallback((): Player[] => {
    return gameState.players.filter(p => !gameState.foldedPlayerIds.has(p.id));
  }, [gameState.players, gameState.foldedPlayerIds]);

  const getCurrentPlayer = useCallback((): Player | null => {
    if (!gameState.roundActive || gameState.currentPlayerIndex < 0 || gameState.currentPlayerIndex >= gameState.players.length) {
      return null;
    }
    return gameState.players[gameState.currentPlayerIndex];
  }, [gameState.roundActive, gameState.currentPlayerIndex, gameState.players]);

  const activePlayers = getActivePlayers();
  const currentPlayer = getCurrentPlayer();

  // --- Core Game Logic ---
  const advanceTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev.roundActive) return prev;
      const active = prev.players.filter(p => !prev.foldedPlayerIds.has(p.id));
      if (active.length <= 1) return prev;

      let nextIndex = prev.currentPlayerIndex;
      do {
        nextIndex = (nextIndex + 1) % prev.players.length;
      } while (prev.foldedPlayerIds.has(prev.players[nextIndex].id));

      return { ...prev, currentPlayerIndex: nextIndex };
    });
  }, []);

  const checkForWinner = useCallback((currentPlayers: Player[], foldedIds: Set<number>): Player | null => {
    const active = currentPlayers.filter(p => !foldedIds.has(p.id));
    return active.length === 1 ? active[0] : null;
  }, []);

  const endRound = useCallback((winner: Player | null) => {
    setGameState(prev => {
      const finalMessages = [...prev.messages];
      let finalPlayers = prev.players;
      let newLastWinnerId = prev.lastWinnerId;
      // Capture the boot amount from the round that just ended
      const lastBootFromRound = prev.roundInitialBootAmount;

      if (winner) {
        finalMessages.push(`Congratulations! ${winner.name} won the pot of ₹ ${prev.potAmount}`);
        finalPlayers = prev.players.map(p =>
          p.id === winner.id ? { ...p, balance: p.balance + prev.potAmount } : p
        );
        newLastWinnerId = winner.id;
      } else {
        finalMessages.push("Round ended with no winner determined.");
      }

      return {
        ...prev,
        players: finalPlayers,
        lastWinnerId: newLastWinnerId,
        roundActive: false,
        currentPlayerIndex: -1,
        potAmount: 0,
        currentStake: 0,
        foldedPlayerIds: new Set<number>(),
        blindPlayerIds: new Set<number>(),
        roundContributions: new Map<number, number>(),
        lastActorWasBlind: false,
        // **This is the important addition**
        roundInitialBootAmount: lastBootFromRound,
        messages: finalMessages,
      };
    });
  }, []);
  // --- Player Actions ---
  const startNewGame = (newPlayers: Player[]) => {
    setGameState({
      ...createInitialGameState(),
      players: newPlayers,
      messages: [`New game started with ${newPlayers.length} players. Please set the boot amount.`],
    });
  };

  const loadGame = () => {
    const loadedState = loadStateFromLocalStorage();
    if (loadedState) {
      setGameState(loadedState);
      addMessage("Saved game loaded.");
      return true;
    }
    addMessage("No valid saved game found.", true);
    return false;
  };

  const startRound = (startingPlayerIndex: number, bootAmount: number) => {
    localStorage.setItem('poker-notes', "Game \nBUST - \nJOKER - ");
    setGameState(prev => {
      let newPot = 0;
      const newContributions = new Map<number, number>();
      const updatedPlayers = prev.players.map(p => {
        newPot += bootAmount;
        newContributions.set(p.id, bootAmount);
        return { ...p, balance: p.balance - bootAmount };
      });
      const initialBlindPlayerIds = new Set(updatedPlayers.map(p => p.id));

      addMessage(`Collecting Boot Amount: ₹ ${bootAmount} from each player. Pot: ₹ ${newPot}`);
      return {
        ...prev,
        players: updatedPlayers,
        roundActive: true,
        blindPlayerIds: initialBlindPlayerIds,
        currentPlayerIndex: startingPlayerIndex,
        currentStake: bootAmount,
        potAmount: newPot,
        foldedPlayerIds: new Set<number>(),
        roundContributions: newContributions,
        lastActorWasBlind: true,
        roundInitialBootAmount: bootAmount,
        messages: [...prev.messages, `Round started. Stake: ₹ ${bootAmount}. Turn: ${toTitleCase(updatedPlayers[startingPlayerIndex].name)}`],
      };
    });
  };

  const playBlind = (isRaise: boolean, amount: number) => {
    if (!currentPlayer || !gameState.blindPlayerIds.has(currentPlayer.id)) return;

    setGameState(prev => {
      const updatedPlayers = prev.players.map(p =>
        p.id === currentPlayer.id ? { ...p, balance: p.balance - amount } : p
      );
      const newContributions = new Map(prev.roundContributions);
      newContributions.set(currentPlayer.id, (newContributions.get(currentPlayer.id) || 0) + amount);

      const message = isRaise
        ? `${toTitleCase(currentPlayer.name)} raises blind to ₹ ${amount}.`
        : `${toTitleCase(currentPlayer.name)} plays blind for ₹ ${amount}.`;

      return {
        ...prev,
        players: updatedPlayers,
        potAmount: prev.potAmount + amount,
        roundContributions: newContributions,
        currentStake: isRaise ? amount : prev.currentStake,
        lastActorWasBlind: true,
        messages: [...prev.messages, message],
      };
    });
    advanceTurn();
  };

  const seeCards = () => {
    if (!currentPlayer || !gameState.blindPlayerIds.has(currentPlayer.id)) return;
    setGameState(prev => {
      const newBlindPlayerIds = new Set(prev.blindPlayerIds);
      newBlindPlayerIds.delete(currentPlayer.id);
      return {
        ...prev,
        blindPlayerIds: newBlindPlayerIds,
        messages: [...prev.messages, `${toTitleCase(currentPlayer.name)} sees their cards.`],
      };
    });
  };

  const betChaal = (amount: number) => {
    if (!currentPlayer || gameState.blindPlayerIds.has(currentPlayer.id)) return;

    setGameState(prev => {
      const newPlayers = prev.players.map(p =>
        p.id === currentPlayer.id ? { ...p, balance: p.balance - amount } : p
      );
      const newContributions = new Map(prev.roundContributions);
      newContributions.set(currentPlayer.id, (newContributions.get(currentPlayer.id) || 0) + amount);

      const effectiveBlindStake = Math.floor(amount / 2);
      const newCurrentStake = Math.max(prev.currentStake, effectiveBlindStake);

      const messages = [...prev.messages, `${toTitleCase(currentPlayer.name)} bets ₹ ${amount}.`];
      if (newCurrentStake > prev.currentStake) {
        messages.push(` Stake (for blind) updated to ₹ ${newCurrentStake}.`);
      }

      return {
        ...prev,
        players: newPlayers,
        potAmount: prev.potAmount + amount,
        currentStake: newCurrentStake,
        roundContributions: newContributions,
        lastActorWasBlind: false,
        messages,
      };
    });
    advanceTurn();
  };

  const fold = () => {
    if (!currentPlayer) return;

    addMessage(`${toTitleCase(currentPlayer.name)} folds.`);
    const newFoldedIds = new Set(gameState.foldedPlayerIds).add(currentPlayer.id);

    const winner = checkForWinner(gameState.players, newFoldedIds);
    if (winner) {
      addMessage(`${toTitleCase(winner.name)} is the last player remaining and wins!`);
      // Use a temp state update to show the fold message before ending the round
      setGameState(prev => ({ ...prev, messages: [...prev.messages, `${toTitleCase(winner.name)} wins!`] }));
      endRound(winner);
    } else {
      setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
      advanceTurn();
    }
  };

  const requestShow = (cost: number) => {
    if (!currentPlayer) return;
    setGameState(prev => {
      const updatedPlayers = prev.players.map(p =>
        p.id === currentPlayer.id ? { ...p, balance: p.balance - cost } : p
      );
      const newContributions = new Map(prev.roundContributions);
      newContributions.set(currentPlayer.id, (newContributions.get(currentPlayer.id) || 0) + cost);
      return {
        ...prev,
        players: updatedPlayers,
        potAmount: prev.potAmount + cost,
        roundContributions: newContributions,
      };
    });
  };

  const resolveShow = (loserId: number) => {
    const loser = gameState.players.find(p => p.id === loserId);
    if (!loser) return;

    addMessage(`${toTitleCase(loser.name)} folds after the Show.`);
    const newFoldedIds = new Set(gameState.foldedPlayerIds).add(loserId);
    const winner = checkForWinner(gameState.players, newFoldedIds);

    if (winner) {
      endRound(winner);
    } else {
      setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
      advanceTurn();
    }
  };

  const addPlayer = (name: string, balance: number) => {
    const newId = gameState.players.length > 0 ? Math.max(...gameState.players.map(p => p.id)) + 1 : 1;
    const newPlayer: Player = { id: newId, name: toTitleCase(name), balance };
    setGameState(prev => ({
      ...prev,
      players: [...prev.players, newPlayer]
    }));
    addMessage(`Player ${toTitleCase(name)} added.`);
  };

  const removePlayer = (playerId: number) => {
    const playerToRemove = gameState.players.find(p => p.id === playerId);
    if (!playerToRemove) return;

    setGameState(prev => {
      const newPlayers = prev.players.filter(p => p.id !== playerId);
      const newBlindIds = new Set(prev.blindPlayerIds); newBlindIds.delete(playerId);
      const newFoldedIds = new Set(prev.foldedPlayerIds); newFoldedIds.delete(playerId);
      const newContributions = new Map(prev.roundContributions); newContributions.delete(playerId);

      return {
        ...prev,
        players: newPlayers,
        lastWinnerId: prev.lastWinnerId === playerId ? null : prev.lastWinnerId,
        blindPlayerIds: newBlindIds,
        foldedPlayerIds: newFoldedIds,
        roundContributions: newContributions,
      };
    });
    addMessage(`Player ${toTitleCase(playerToRemove.name)} removed.`);
  };

  const reorderPlayers = (reordered: Player[]) => {
    setGameState(prev => ({
      ...prev,
      players: reordered,
      lastWinnerId: null,
      currentPlayerIndex: -1,
      messages: [...prev.messages, "Player order updated."],
    }));
  };

  const deductAndDistribute = (playerId: number, amount: number) => {
    setGameState(prev => {
      const { players } = prev;
      const playerToDeduct = players.find(p => p.id === playerId);
      if (!playerToDeduct) {
        addMessage(`Player with ID ${playerId} not found.`, true);
        return prev;
      }
      if (players.length < 2) {
        addMessage("Cannot distribute with less than two players.", true);
        return prev;
      }

      const amountToDistribute = Math.floor(amount / (players.length - 1));
      const updatedPlayers = players.map(p => {
        if (p.id === playerId) {
          return { ...p, balance: p.balance - amount };
        } else {
          return { ...p, balance: p.balance + amountToDistribute };
        }
      });

      addMessage(`Deducted ₹ ${amount} from ${toTitleCase(playerToDeduct.name)} and distributed ₹ ${amountToDistribute} to everyone else.`);
      return { ...prev, players: updatedPlayers };
    });
  };

  return {
    gameState,
    setGameState, // Exposing for direct manipulation if needed (e.g., in modals)
    addMessage,
    activePlayers,
    currentPlayer,
    actions: {
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
    }
  };
};