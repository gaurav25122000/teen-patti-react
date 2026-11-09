// src/hooks/useTeenPattiGame.ts

import { useEffect, useCallback, useMemo } from 'react';
import type { GameState, Player, Entity } from '../types/gameTypes';
import { loadStateFromLocalStorage, saveStateToLocalStorage } from '../utils/localStorage';
import { toTitleCase } from '../utils/formatters';
import { bulkUpdateWinnings, type WinningsRecord } from '../utils/winningsService';
import { splitEvenly } from '../utils/money';
import { SHA256 } from 'crypto-js';
import { useUndo } from './useUndo';
import { useGameState } from './useGameState';
import { emptyStats, recordRound, statsNames } from '../utils/nightStats';
import { teenPattiSettlement } from '../utils/gameSettlement';
import { archiveOrWarn } from '../utils/archive';
import { partyKey } from '../utils/owingsLogic';
import { rememberPlayers } from '../utils/savedPlayers';
import { betRefusal, bootRefusal, potLimitLines, roundCarryOver, tableRulesLine, type TableRules } from '../utils/teenPattiRules';

// A non-zero starting balance marks the game as carried in; the summary then says so.
const carry = (balances: number[]) => (balances.some(b => Math.abs(b) >= 0.005) ? { carriedIn: true } : {});

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
  blindTurns: {},
  stats: emptyStats(),
  messages: ["Welcome! Load a game or set up a new one."],
});

// Also used by spectators, who get raw state over the stream.
export const derivePlayers = (gameState: Pick<GameState, 'players' | 'foldedPlayerIds' | 'roundActive' | 'currentPlayerIndex'>) => {
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
};

export const useTeenPattiGame = () => {
  const [gameState, setGameState, log, afterCommit] = useGameState<GameState>(() => {
    return loadStateFromLocalStorage() || createInitialGameState();
  });

  const { record, undo, canUndo } = useUndo(gameState, setGameState, gameState.roundActive);

  // --- Persistence ---
  useEffect(() => {
    saveStateToLocalStorage(gameState);
  }, [gameState]);

  // --- Utility Functions ---
  const addMessage = useCallback((message: string, isError: boolean = false) => {
    log(`${isError ? "ERROR: " : ""}${message}`);
  }, [log]);

  // --- DERIVED STATE ---
  const { players, foldedPlayerIds, roundActive, currentPlayerIndex } = gameState;
  const { activePlayers, currentPlayer, precedingPlayer } = useMemo(
    () => derivePlayers({ players, foldedPlayerIds, roundActive, currentPlayerIndex }),
    [players, foldedPlayerIds, roundActive, currentPlayerIndex]
  );


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
  }, [setGameState]);

  const checkForWinner = useCallback((currentPlayers: Player[], foldedIds: Set<number>): Player | null => {
    const active = currentPlayers.filter(p => !foldedIds.has(p.id));
    return active.length === 1 ? active[0] : null;
  }, []);

  const endRound = useCallback((winner: Player | null) => {
    setGameState(prev => {
      const finalMessages = [...prev.messages];
      let finalPlayers = prev.players;
      let newLastWinnerId = prev.lastWinnerId;
      let stats = prev.stats ?? emptyStats();
      const lastBootFromRound = prev.roundInitialBootAmount;

      if (winner) {
        finalMessages.push(`--- ROUND OVER ---`);
        finalMessages.push(`Congratulations! ${toTitleCase(winner.name)} won the pot of ₹${prev.potAmount}`);

        const recordsToUpdate: WinningsRecord[] = [];
        const timestamp = new Date().toISOString();

        prev.players.forEach(player => {
          if (player.phoneNumber) {
            const contribution = prev.roundContributions.get(player.id) || 0;
            const winnings = player.id === winner.id ? prev.potAmount - contribution : -contribution;

            if (winnings !== 0) {
              recordsToUpdate.push({
                phoneHash: SHA256(player.phoneNumber).toString(),
                playerName: player.name,
                gameType: 'teen-patti',
                winnings,
                timestamp
              });
            }
          }
        });

        afterCommit(() => bulkUpdateWinnings(recordsToUpdate));

        const key = (p: Player) => partyKey(p.name, p.phoneNumber);
        const nets: Record<string, number> = {};
        prev.players.forEach(p => {
          const contribution = prev.roundContributions.get(p.id) || 0;
          if (p.id === winner.id) nets[key(p)] = prev.potAmount - contribution;
          else if (contribution > 0) nets[key(p)] = -contribution;
        });
        stats = recordRound(stats, nets, { key: key(winner), amount: prev.potAmount }, statsNames(prev.players));

        finalPlayers = prev.players.map(p =>
          p.id === winner.id ? { ...p, balance: p.balance + prev.potAmount } : p
        );
        newLastWinnerId = winner.id;

      } else {
        finalMessages.push("Round ended with no winner determined.");
      }

      // Preserve 'isTakingBreak' status when resetting game state
      const playerBreakStatus = new Map(prev.players.map(p => [p.id, p.isTakingBreak]));
      const finalPlayersWithBreakStatus = finalPlayers.map(p => ({
        ...p,
        isTakingBreak: playerBreakStatus.get(p.id) || false
      }));


      return {
        ...createInitialGameState(),
        players: finalPlayersWithBreakStatus, // Use players with break status
        lastWinnerId: newLastWinnerId,
        roundInitialBootAmount: lastBootFromRound,
        ...roundCarryOver(prev),
        stats,
        messages: finalMessages,
      };
    });
  }, [setGameState, afterCommit]);

  // --- Player Actions ---
  const startNewGame = (newPlayers: Player[], rules: TableRules = {}) => {
    setGameState(prev => {
      afterCommit(() => archiveOrWarn('teen-patti', prev.stats, teenPattiSettlement(prev)));
      return {
        ...createInitialGameState(),
        ...rules,
        ...carry(newPlayers.map(p => p.balance)),
        players: newPlayers.map(p => ({ ...p, isTakingBreak: false })), // Ensure break status is reset
        messages: newPlayers.length > 0 ? [`New game started with ${newPlayers.length} players. Please set the boot amount.`] : ["Returning to setup..."],
      };
    });
    const full = rememberPlayers(newPlayers.map(p => ({ name: p.name, phone: p.phoneNumber })));
    if (full) addMessage(full);
  };

  // Empties the game without saving it to history (used after handing the game to another phone).
  const clearGame = () => setGameState(createInitialGameState());

  const updateTableRules = (rules: TableRules) => {
    setGameState(prev => prev.roundActive ? prev : {
      ...prev,
      potLimit: rules.potLimit,
      maxBlindTurns: rules.maxBlindTurns,
      maxChaal: rules.maxChaal,
      messages: [...prev.messages, tableRulesLine(rules)],
    });
  };

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
    const bootRefused = bootRefusal(gameState, bootAmount);
    if (bootRefused) {
      addMessage(bootRefused, true);
      return bootRefused;
    }
    localStorage.setItem('poker-notes', "Game \nBUST - \nJOKER - ");
    setGameState(prev => {
      // MODIFIED: Filter out players on break
      const activePlayersForRound = prev.players.filter(p => !p.isTakingBreak);
      if (activePlayersForRound.length < 2) {
        addMessage("Not enough active players to start a round.", true);
        return prev;
      }
      const activePlayerIds = new Set(activePlayersForRound.map(p => p.id));
      
      // MODIFIED: Find the next *active* starting player
      let finalStartingPlayerIndex = startingPlayerIndex;
      if (!activePlayerIds.has(prev.players[finalStartingPlayerIndex].id)) {
        addMessage("Selected start player is on break. Finding next active player...");
        do {
          finalStartingPlayerIndex = (finalStartingPlayerIndex + 1) % prev.players.length;
        } while (!activePlayerIds.has(prev.players[finalStartingPlayerIndex].id));
      }
      
      let newPot = 0;
      const newContributions = new Map<number, number>();
      
      // MODIFIED: Collect boot only from active players
      const updatedPlayers = prev.players.map(p => {
        if (activePlayerIds.has(p.id)) {
          newPot += bootAmount;
          newContributions.set(p.id, bootAmount);
          return { ...p, balance: p.balance - bootAmount };
        }
        return p; // No change for players on break
      });

      // MODIFIED: Blind players are only active players
      const initialBlindPlayerIds = new Set(activePlayersForRound.map(p => p.id));
      // MODIFIED: Folded players are those on break
      const initialFoldedPlayerIds = new Set(prev.players.filter(p => p.isTakingBreak).map(p => p.id));

      const startingPlayer = updatedPlayers[finalStartingPlayerIndex];

      const messages = [
        ...prev.messages,
        `--- NEW ROUND STARTED ---`,
        `Collecting Boot Amount: ₹${bootAmount} from ${activePlayersForRound.length} active players.`,
        `Total Pot: ₹${newPot}.`,
        `Turn starts with ${toTitleCase(startingPlayer.name)}.`,
        ...potLimitLines(prev.potLimit, newPot),
      ];

      return {
        ...prev,
        players: updatedPlayers,
        roundActive: true,
        blindPlayerIds: initialBlindPlayerIds,
        currentPlayerIndex: finalStartingPlayerIndex,
        currentStake: bootAmount,
        potAmount: newPot,
        foldedPlayerIds: initialFoldedPlayerIds,
        roundContributions: newContributions,
        blindTurns: {},
        lastActorWasBlind: true,
        roundInitialBootAmount: bootAmount,
        messages,
      };
    });
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
        blindTurns: { ...prev.blindTurns, [currentPlayer.id]: (prev.blindTurns?.[currentPlayer.id] ?? 0) + 1 },
        messages: [...prev.messages, message, ...potLimitLines(prev.potLimit, newPotAmount)],
      };
    });
    advanceTurn();
    return null;
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

  const betChaal = (amount: number): string | null => {
    if (!currentPlayer || gameState.blindPlayerIds.has(currentPlayer.id)) return null;
    const refusal = refuse('chaal', amount, currentPlayer);
    if (refusal) return refusal;

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
      messages.push(...potLimitLines(prev.potLimit, newPotAmount));

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
    return null;
  };

  const fold = () => {
    if (!currentPlayer) return;

    const foldedPlayerName = toTitleCase(currentPlayer.name);
    addMessage(`${foldedPlayerName} folds.`);
    const newFoldedIds = new Set(gameState.foldedPlayerIds).add(currentPlayer.id);

    const winner = checkForWinner(gameState.players, newFoldedIds);
    if (winner) {
      addMessage(`${toTitleCase(winner.name)} is the last player remaining.`);
      setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
      endRound(winner);
    } else {
      setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
      advanceTurn();
    }
  };

  const requestShow = (cost: number): string | null => {
    if (!currentPlayer) return null;
    const refusal = refuse('show', cost, currentPlayer);
    if (refusal) return refusal;
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
        messages: [...prev.messages, `A Show is requested for ₹${cost}. Pot is now ₹${prev.potAmount + cost}.`, ...potLimitLines(prev.potLimit, prev.potAmount + cost)]
      };
    });
    return null;
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

  const addPlayer = (name: string, balance: number, phoneNumber: string) => {
    const newId = gameState.players.length > 0 ? Math.max(...gameState.players.map(p => p.id)) + 1 : 1;
    const newPlayer: Player = { 
      id: newId, 
      name: toTitleCase(name), 
      balance, 
      phoneNumber,
      isTakingBreak: false // ADDED
    };
    setGameState(prev => ({
      ...prev,
      players: [...prev.players, newPlayer],
      ...carry([balance]),
    }));
    addMessage(`Player ${toTitleCase(name)} added with balance ₹${balance}.`);
    const full = rememberPlayers([{ name: newPlayer.name, phone: phoneNumber }]);
    if (full) addMessage(full);
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
      const shares = splitEvenly(amount, players.length - 1);
      let shareIndex = 0;
      const updatedPlayers = players.map(p => {
        if (p.id === playerId) {
          return { ...p, balance: p.balance - amount };
        } else {
          return { ...p, balance: p.balance + shares[shareIndex++] };
        }
      });

      const leftoverNote = shares.some(s => s !== amountToDistribute) ? ' (leftover to the first players in order)' : '';
      addMessage(`Deducted ₹${amount} from ${toTitleCase(playerToDeduct.name)} and distributed ₹${amountToDistribute} to everyone else${leftoverNote}.`);
      return { ...prev, players: updatedPlayers };
    });
  };

  // ADDED
  const togglePlayerBreak = useCallback((playerId: number) => {
    setGameState(prev => {
        if (prev.roundActive) {
            addMessage("Can only take a break between hands.", true);
            return prev;
        }
        const newPlayers = prev.players.map(p =>
            p.id === playerId ? { ...p, isTakingBreak: !p.isTakingBreak } : p
        );
        const player = prev.players.find(p => p.id === playerId);
        if (player) {
            addMessage(`${toTitleCase(player.name)} is now ${!player.isTakingBreak ? 'on a break' : 'back'}.`);
        }
        return { ...prev, players: newPlayers };
    });
  }, [addMessage, setGameState]);

  return {
    gameState,
    addMessage,
    activePlayers,
    currentPlayer,
    precedingPlayer,
    undo,
    canUndo,
    actions: record({
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
      togglePlayerBreak, // ADDED
      clearGame,
      updateTableRules,
    })
  };
};