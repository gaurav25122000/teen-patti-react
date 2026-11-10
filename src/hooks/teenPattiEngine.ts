// Teen Patti game steps as pure functions: the hook runs them inside setGameState, tests run them directly.
import type { GameState, Player, Entity } from '../types/gameTypes.ts';
import type { Io, RawRecord } from '../utils/engine.ts';
import { formatAmount, toTitleCase } from '../utils/formatters.ts';
import { splitEvenly, toPaise } from '../utils/money.ts';
import { emptyStats, recordRound, statsNames } from '../utils/nightStats.ts';
import { partyKey } from '../utils/owingsLogic.ts';
import { nextBoot, potLimitLines, roundCarryOver } from '../utils/teenPattiRules.ts';
import { MID_ROUND, teenPattiChange, type TeenPattiSettings } from '../utils/gameSettings.ts';
import { depart, departureNote, tooFewToRemove } from '../utils/departures.ts';

// A non-zero starting balance marks the game as carried in; the summary then says so.
const carried = (balances: number[]) => balances.some(b => Math.abs(b) >= 0.005);

export const createInitialGameState = (): GameState => ({
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

const currentOf = (s: GameState) => derivePlayers(s).currentPlayer;

// Every amount in whole paise after a step: float sums drift (10.1 + 10.1 + 10.1 = 30.299999999999997).
export const roundMoney = (s: GameState): GameState => ({
  ...s,
  potAmount: toPaise(s.potAmount),
  currentStake: toPaise(s.currentStake),
  players: s.players.map(p => ({ ...p, balance: toPaise(p.balance) })),
  roundContributions: new Map([...s.roundContributions].map(([id, amount]) => [id, toPaise(amount)])),
  departed: s.departed?.map(d => ({ ...d, net: toPaise(d.net) })),
});

export const advanceTurn = (prev: GameState): GameState => {
  if (!prev.roundActive) return prev;
  const active = prev.players.filter(p => !prev.foldedPlayerIds.has(p.id));
  if (active.length <= 1) return prev;

  let nextIndex = prev.currentPlayerIndex;
  do {
    nextIndex = (nextIndex + 1) % prev.players.length;
  } while (prev.foldedPlayerIds.has(prev.players[nextIndex].id));

  const nextPlayer = prev.players[nextIndex];
  return { ...prev, currentPlayerIndex: nextIndex, messages: [...prev.messages, `--- Turn is now on ${toTitleCase(nextPlayer.name)} ---`] };
};

const lastPlayerStanding = (players: Player[], foldedIds: Set<number>): Player | null => {
  const active = players.filter(p => !foldedIds.has(p.id));
  return active.length === 1 ? active[0] : null;
};

export const endRound = (prev: GameState, winnerId: number | null, io: Io): GameState => {
  const winner = winnerId === null ? undefined : prev.players.find(p => p.id === winnerId);
  const finalMessages = [...prev.messages];
  let finalPlayers = prev.players;
  let newLastWinnerId = prev.lastWinnerId;
  let stats = prev.stats ?? emptyStats();

  if (winner) {
    finalMessages.push(`--- ROUND OVER ---`);
    finalMessages.push(`Congratulations! ${toTitleCase(winner.name)} won the pot of ₹${formatAmount(prev.potAmount)}`);

    const rows: RawRecord[] = [];
    prev.players.forEach(player => {
      if (player.phoneNumber) {
        const contribution = prev.roundContributions.get(player.id) || 0;
        const winnings = player.id === winner.id ? prev.potAmount - contribution : -contribution;
        if (winnings !== 0) rows.push({ phone: player.phoneNumber, name: player.name, winnings });
      }
    });
    io.records(rows);

    const key = (p: Player) => partyKey(p.name, p.phoneNumber);
    const nets: Record<string, number> = {};
    prev.players.forEach(p => {
      const contribution = prev.roundContributions.get(p.id) || 0;
      if (p.id === winner.id) nets[key(p)] = prev.potAmount - contribution;
      else if (contribution > 0) nets[key(p)] = -contribution;
    });
    stats = recordRound(stats, nets, { key: key(winner), amount: prev.potAmount }, statsNames(prev.players));

    finalPlayers = prev.players.map(p => (p.id === winner.id ? { ...p, balance: p.balance + prev.potAmount } : p));
    newLastWinnerId = winner.id;
  } else {
    finalMessages.push("Round ended with no winner determined.");
  }

  return {
    ...createInitialGameState(),
    players: finalPlayers.map(p => ({ ...p, isTakingBreak: p.isTakingBreak || false })),
    lastWinnerId: newLastWinnerId,
    roundInitialBootAmount: prev.roundInitialBootAmount,
    ...roundCarryOver(prev),
    stats,
    messages: finalMessages,
  };
};

export const newGame = (newPlayers: Player[], settings: TeenPattiSettings = {}, startedAt?: number): GameState => ({
  ...createInitialGameState(),
  ...settings,
  startedAt,
  carriedIn: carried(newPlayers.map(p => p.balance)),
  players: newPlayers.map(p => ({ ...p, isTakingBreak: false })),
  messages: newPlayers.length > 0 ? [`New game started with ${newPlayers.length} players. Please set the boot amount.`] : ["Returning to setup..."],
});

export const settingsOf = (s: GameState): TeenPattiSettings => ({
  defaultBoot: s.defaultBoot, potLimit: s.potLimit, maxBlindTurns: s.maxBlindTurns, maxChaal: s.maxChaal,
  turnTimer: s.turnTimer, bootRiseEvery: s.bootRiseEvery, bootRiseStep: s.bootRiseStep,
});

// Between rounds only; logs one line naming what changed.
export const applySettings = (prev: GameState, settings: TeenPattiSettings, io: Io): GameState => {
  if (prev.roundActive) {
    io.log(`ERROR: ${MID_ROUND}`);
    return prev;
  }
  const line = teenPattiChange(settingsOf(prev), settings);
  return { ...prev, ...settings, messages: line ? [...prev.messages, line] : prev.messages };
};

// The caller checks the boot refusal (max chaal) on nextBoot first.
export const startRound = (prev: GameState, startingPlayerIndex: number, chosenBoot: number, io: Io): GameState => {
  const activePlayersForRound = prev.players.filter(p => !p.isTakingBreak);
  if (activePlayersForRound.length < 2) {
    io.log("ERROR: Not enough active players to start a round.");
    return prev;
  }
  const activePlayerIds = new Set(activePlayersForRound.map(p => p.id));

  let finalStartingPlayerIndex = startingPlayerIndex;
  if (!activePlayerIds.has(prev.players[finalStartingPlayerIndex].id)) {
    io.log("Selected start player is on break. Finding next active player...");
    do {
      finalStartingPlayerIndex = (finalStartingPlayerIndex + 1) % prev.players.length;
    } while (!activePlayerIds.has(prev.players[finalStartingPlayerIndex].id));
  }

  const bootAmount = nextBoot(prev, chosenBoot);
  if (bootAmount !== chosenBoot) io.log(`Boot is now ₹${formatAmount(bootAmount)}.`);

  // The dealer sits just before the starter, skipping players on a break.
  let dealerIndex = finalStartingPlayerIndex;
  do {
    dealerIndex = (dealerIndex - 1 + prev.players.length) % prev.players.length;
  } while (!activePlayerIds.has(prev.players[dealerIndex].id));

  let newPot = 0;
  const newContributions = new Map<number, number>();
  const updatedPlayers = prev.players.map(p => {
    if (!activePlayerIds.has(p.id)) return p;
    newPot += bootAmount;
    newContributions.set(p.id, bootAmount);
    return { ...p, balance: p.balance - bootAmount };
  });
  const startingPlayer = updatedPlayers[finalStartingPlayerIndex];

  return {
    ...prev,
    players: updatedPlayers,
    roundActive: true,
    blindPlayerIds: new Set(activePlayersForRound.map(p => p.id)),
    currentPlayerIndex: finalStartingPlayerIndex,
    currentStake: bootAmount,
    potAmount: newPot,
    foldedPlayerIds: new Set(prev.players.filter(p => p.isTakingBreak).map(p => p.id)),
    roundContributions: newContributions,
    blindTurns: {},
    lastActorWasBlind: true,
    roundInitialBootAmount: bootAmount,
    dealerId: prev.players[dealerIndex].id,
    roundsStarted: (prev.roundsStarted ?? 0) + 1,
    messages: [
      ...prev.messages,
      `--- NEW ROUND STARTED ---`,
      `Collecting Boot Amount: ₹${formatAmount(bootAmount)} from ${activePlayersForRound.length} active players.`,
      `Total Pot: ₹${formatAmount(newPot)}.`,
      `Turn starts with ${toTitleCase(startingPlayer.name)}.`,
      ...potLimitLines(prev.potLimit, newPot),
    ],
  };
};

// Moves `amount` from a player's balance into the pot.
const pay = (prev: GameState, playerId: number, amount: number) => {
  const contributions = new Map(prev.roundContributions);
  contributions.set(playerId, (contributions.get(playerId) || 0) + amount);
  return {
    players: prev.players.map(p => (p.id === playerId ? { ...p, balance: p.balance - amount } : p)),
    roundContributions: contributions,
    potAmount: prev.potAmount + amount,
  };
};

// Bet steps assume the caller checked betRefusal (table rules).
export const playBlind = (prev: GameState, isRaise: boolean, amount: number): GameState => {
  const current = currentOf(prev);
  if (!current || !prev.blindPlayerIds.has(current.id)) return prev;
  const paid = pay(prev, current.id, amount);
  const message = isRaise
    ? `${toTitleCase(current.name)} raises blind to ₹${formatAmount(amount)}. Pot is now ₹${formatAmount(paid.potAmount)}.`
    : `${toTitleCase(current.name)} plays blind for ₹${formatAmount(amount)}. Pot is now ₹${formatAmount(paid.potAmount)}.`;
  return advanceTurn({
    ...prev,
    ...paid,
    currentStake: isRaise ? amount : prev.currentStake,
    lastActorWasBlind: true,
    blindTurns: { ...prev.blindTurns, [current.id]: (prev.blindTurns?.[current.id] ?? 0) + 1 },
    messages: [...prev.messages, message, ...potLimitLines(prev.potLimit, paid.potAmount)],
  });
};

export const seeCards = (prev: GameState): GameState => {
  const current = currentOf(prev);
  if (!current || !prev.blindPlayerIds.has(current.id)) return prev;
  const blind = new Set(prev.blindPlayerIds);
  blind.delete(current.id);
  return { ...prev, blindPlayerIds: blind, messages: [...prev.messages, `${toTitleCase(current.name)} sees their cards and is now playing Chaal.`] };
};

export const betChaal = (prev: GameState, amount: number): GameState => {
  const current = currentOf(prev);
  if (!current || prev.blindPlayerIds.has(current.id)) return prev;
  const paid = pay(prev, current.id, amount);
  // Half the chaal, rounded up, is the new blind stake (Gaurav, 10 Nov); a minimum chaal leaves it as it is.
  const newCurrentStake = amount / 2 > prev.currentStake ? Math.ceil(amount / 2) : prev.currentStake;
  const messages = [...prev.messages, `${toTitleCase(current.name)} bets Chaal of ₹${formatAmount(amount)}. Pot is now ₹${formatAmount(paid.potAmount)}.`];
  if (newCurrentStake > prev.currentStake) messages.push(`New stake for Blind players is now ₹${formatAmount(newCurrentStake)}.`);
  messages.push(...potLimitLines(prev.potLimit, paid.potAmount));
  return advanceTurn({ ...prev, ...paid, currentStake: newCurrentStake, lastActorWasBlind: false, messages });
};

// Folds a player; the last one standing wins the pot, otherwise the turn moves on.
const foldOut = (prev: GameState, playerId: number, io: Io): GameState => {
  const folded = new Set(prev.foldedPlayerIds).add(playerId);
  const winner = lastPlayerStanding(prev.players, folded);
  const next = { ...prev, foldedPlayerIds: folded };
  if (!winner) return advanceTurn(next);
  io.log(`${toTitleCase(winner.name)} is the last player remaining.`);
  return endRound(next, winner.id, io);
};

export const fold = (prev: GameState, io: Io): GameState => {
  const current = currentOf(prev);
  if (!current) return prev;
  io.log(`${toTitleCase(current.name)} folds.`);
  return foldOut(prev, current.id, io);
};

export const requestShow = (prev: GameState, cost: number): GameState => {
  const current = currentOf(prev);
  if (!current) return prev;
  const paid = pay(prev, current.id, cost);
  return {
    ...prev,
    ...paid,
    messages: [...prev.messages, `A Show is requested for ₹${formatAmount(cost)}. Pot is now ₹${formatAmount(paid.potAmount)}.`, ...potLimitLines(prev.potLimit, paid.potAmount)],
  };
};

export const resolveShow = (prev: GameState, loserId: number, io: Io): GameState => {
  const loser = prev.players.find(p => p.id === loserId);
  if (!loser) return prev;
  io.log(`${toTitleCase(loser.name)} loses the Show and folds.`);
  return foldOut(prev, loserId, io);
};

export const addPlayer = (prev: GameState, name: string, balance: number, phoneNumber: string, io: Io): GameState => {
  const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
  io.log(`Player ${toTitleCase(name)} added with balance ₹${formatAmount(balance)}.`);
  return {
    ...prev,
    players: [...prev.players, { id: newId, name: toTitleCase(name), balance, phoneNumber, isTakingBreak: false }],
    ...(carried([balance]) ? { carriedIn: true } : {}),
  };
};

// Between rounds only; the leaver's balance stays in the settlement as a departure.
export const removePlayer = (prev: GameState, playerId: number, io: Io): GameState => {
  const player = prev.players.find(p => p.id === playerId);
  if (!player) return prev;
  if (prev.roundActive) {
    io.log("ERROR: Can only remove players between hands.");
    return prev;
  }
  if (prev.players.length <= 2) {
    io.log(`ERROR: ${tooFewToRemove(2)}`);
    return prev;
  }
  io.log(`Player ${toTitleCase(player.name)} removed from the game.${departureNote(player.balance)}`);
  return {
    ...prev,
    players: prev.players.filter(p => p.id !== playerId),
    departed: depart(prev.departed, { name: player.name, phone: player.phoneNumber, entityId: player.entityId, net: player.balance }),
  };
};

export const reorderPlayers = (prev: GameState, reordered: Player[]): GameState => ({
  ...prev,
  players: reordered,
  lastWinnerId: null,
  currentPlayerIndex: -1,
  messages: [...prev.messages, "Player order updated. The first player in the list will deal next."],
});

export const updateEntities = (prev: GameState, entities: Entity[]): GameState => ({ ...prev, entities });

export const updatePlayers = (prev: GameState, players: Player[]): GameState => ({ ...prev, players });

export const deductAndDistribute = (prev: GameState, playerId: number, rawAmount: number, io: Io): GameState => {
  const { players } = prev;
  const amount = toPaise(rawAmount);
  const playerToDeduct = players.find(p => p.id === playerId);
  if (!playerToDeduct) {
    io.log(`ERROR: Player with ID ${playerId} not found.`);
    return prev;
  }
  if (players.length < 2) {
    io.log("ERROR: Cannot distribute with less than two players.");
    return prev;
  }
  const amountToDistribute = Math.floor(amount / (players.length - 1));
  const shares = splitEvenly(amount, players.length - 1);
  let shareIndex = 0;
  const updatedPlayers = players.map(p => (p.id === playerId ? { ...p, balance: p.balance - amount } : { ...p, balance: p.balance + shares[shareIndex++] }));
  const leftoverNote = shares.some(s => s !== amountToDistribute) ? ' (leftover to the first players in order)' : '';
  io.log(`Deducted ₹${formatAmount(amount)} from ${toTitleCase(playerToDeduct.name)} and distributed ₹${formatAmount(amountToDistribute)} to everyone else${leftoverNote}.`);
  return { ...prev, players: updatedPlayers };
};

export const togglePlayerBreak = (prev: GameState, playerId: number, io: Io): GameState => {
  if (prev.roundActive) {
    io.log("ERROR: Can only take a break between hands.");
    return prev;
  }
  const player = prev.players.find(p => p.id === playerId);
  if (player) io.log(`${toTitleCase(player.name)} is now ${!player.isTakingBreak ? 'on a break' : 'back'}.`);
  return { ...prev, players: prev.players.map(p => (p.id === playerId ? { ...p, isTakingBreak: !p.isTakingBreak } : p)) };
};
