// src/hooks/useTeenPattiGame.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GameState, Player, Entity } from '../types/gameTypes';
import { loadStateFromLocalStorage, saveStateToLocalStorage } from '../utils/localStorage';
import { toTitleCase } from '../utils/formatters';

const createInitialGameState = (): GameState => ({
    players: [],
    entities: [],
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

  // --- DERIVED STATE ---
  const { activePlayers, currentPlayer, precedingPlayer } = useMemo(() => {
    const active = gameState.players.filter(p => !gameState.foldedPlayerIds.has(p.id));
    const current = (gameState.roundActive && gameState.currentPlayerIndex >= 0) ? gameState.players[gameState.currentPlayerIndex] : null;

    let preceding: Player | null = null;
    if (current) {
      const numPlayers = gameState.players.length;
      if (numPlayers >= 2) {
        let precedingIndex = gameState.currentPlayerIndex;
        let attempts = 0;
        do {
          precedingIndex = (precedingIndex - 1 + numPlayers) % numPlayers;
          const precedingCandidate = gameState.players[precedingIndex];
          if (precedingCandidate.id !== current.id && !gameState.foldedPlayerIds.has(precedingCandidate.id)) {
            preceding = precedingCandidate;
            break;
          }
          attempts++;
        } while (attempts < numPlayers);
      }
    }
    return { activePlayers: active, currentPlayer: current, precedingPlayer: preceding };
  }, [gameState.players, gameState.foldedPlayerIds, gameState.roundActive, gameState.currentPlayerIndex]);


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

      const nextPlayer = prev.players[nextIndex];
      const newMessages = [...prev.messages, `--- Turn is now on ${toTitleCase(nextPlayer.name)} ---`];

      return { ...prev, currentPlayerIndex: nextIndex, messages: newMessages };
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
      const lastBootFromRound = prev.roundInitialBootAmount;

      if (winner) {
        finalMessages.push(`--- ROUND OVER ---`);
        finalMessages.push(`Congratulations! ${toTitleCase(winner.name)} won the pot of ₹${prev.potAmount}`);
        finalPlayers = prev.players.map(p =>
          p.id === winner.id ? { ...p, balance: p.balance + prev.potAmount } : p
        );
        newLastWinnerId = winner.id;
      } else {
        finalMessages.push("Round ended with no winner determined.");
      }

      return {
        ...createInitialGameState(),
        players: finalPlayers,
        lastWinnerId: newLastWinnerId,
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
      messages: newPlayers.length > 0 ? [`New game started with ${newPlayers.length} players. Please set the boot amount.`] : ["Returning to setup..."],
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
      const startingPlayer = updatedPlayers[startingPlayerIndex];

      const messages = [
        ...prev.messages,
        `--- NEW ROUND STARTED ---`,
        `Collecting Boot Amount: ₹${bootAmount} from each player.`,
        `Total Pot: ₹${newPot}.`,
        `Turn starts with ${toTitleCase(startingPlayer.name)}.`
      ];

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
        messages,
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
      const newPotAmount = prev.potAmount + amount;

      const message = isRaise
        ? `${toTitleCase(currentPlayer.name)} raises blind to ₹${amount}. Pot is now ₹${newPotAmount}.`
        : `${toTitleCase(currentPlayer.name)} plays blind for ₹${amount}. Pot is now ₹${newPotAmount}.`;

      return {
        ...prev,
        players: updatedPlayers,
        potAmount: newPotAmount,
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
        messages: [...prev.messages, `${toTitleCase(currentPlayer.name)} sees their cards and is now playing Chaal.`],
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
      const newPotAmount = prev.potAmount + amount;

      const effectiveBlindStake = Math.floor(amount / 2);
      const newCurrentStake = Math.max(prev.currentStake, effectiveBlindStake);

      const messages = [...prev.messages, `${toTitleCase(currentPlayer.name)} bets Chaal of ₹${amount}. Pot is now ₹${newPotAmount}.`];
      if (newCurrentStake > prev.currentStake) {
        messages.push(`New stake for Blind players is now ₹${newCurrentStake}.`);
      }

      return {
        ...prev,
        players: newPlayers,
        potAmount: newPotAmount,
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

    const foldedPlayerName = toTitleCase(currentPlayer.name);
    addMessage(`${foldedPlayerName} folds.`);
    const newFoldedIds = new Set(gameState.foldedPlayerIds).add(currentPlayer.id);

    const winner = checkForWinner(gameState.players, newFoldedIds);
    if (winner) {
      addMessage(`${toTitleCase(winner.name)} is the last player remaining.`);
      // Temporarily update state to show the fold before ending the round
      setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
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
        messages: [...prev.messages, `A Show is requested for ₹${cost}. Pot is now ₹${prev.potAmount + cost}.`]
      };
    });
  };

  const resolveShow = (loserId: number) => {
    const loser = gameState.players.find(p => p.id === loserId);
    if (!loser) return;

    addMessage(`${toTitleCase(loser.name)} loses the Show and folds.`);
    const newFoldedIds = new Set(gameState.foldedPlayerIds).add(loserId);
    setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));

    const winner = checkForWinner(gameState.players, newFoldedIds);
    if (winner) {
      addMessage(`${toTitleCase(winner.name)} is the last player remaining.`);
      endRound(winner);
    } else {
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
    addMessage(`Player ${toTitleCase(name)} added with balance ₹${balance}.`);
  };

  const removePlayer = (playerId: number) => {
    const playerToRemove = gameState.players.find(p => p.id === playerId);
    if (!playerToRemove) return;
    setGameState(prev => {
      const newPlayers = prev.players.filter(p => p.id !== playerId);
      return {
        ...prev,
        players: newPlayers,
      };
    });
    addMessage(`Player ${toTitleCase(playerToRemove.name)} removed from the game.`);
  };

  const reorderPlayers = (reordered: Player[]) => {
    setGameState(prev => ({
      ...prev,
      players: reordered,
      lastWinnerId: null,
      currentPlayerIndex: -1,
      messages: [...prev.messages, "Player order updated. The first player in the list will deal next."],
    }));
  };

  const updateEntities = (entities: Entity[]) => {
    setGameState(prev => ({ ...prev, entities }));
  };

  const updatePlayers = (players: Player[]) => {
    setGameState(prev => ({ ...prev, players }));
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

      addMessage(`Deducted ₹${amount} from ${toTitleCase(playerToDeduct.name)} and distributed ₹${amountToDistribute} to everyone else.`);
      return { ...prev, players: updatedPlayers };
    });
  };

  return {
    gameState,
    addMessage,
    activePlayers,
    currentPlayer,
    precedingPlayer,
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
      updateEntities,
      updatePlayers,
    }
  };
};