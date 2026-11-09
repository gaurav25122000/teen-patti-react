// Poker game steps as pure functions: the hook runs them inside setGameState, tests run them directly.
import type { PokerGameState, PokerPlayer, GameStage, Pot } from './types/pokerGameTypes.ts';
import type { Io, RawRecord } from '../utils/engine.ts';
import { calculatePots } from './utils/pokerLogic.ts';
import { toTitleCase } from '../utils/formatters.ts';
import { splitEvenly } from '../utils/money.ts';
import { foldOutLine, foldOutStreak, handCandidate, handNets, nextStreak, potLine } from './utils/streak.ts';
import { pauseClock, resumeClock, startClock, tickLevel } from './utils/blindLevels.ts';
import { emptyStats, partialStats, recordRound, statsNames } from '../utils/nightStats.ts';
import { cleanPhone } from '../utils/savedPlayers.ts';

export type PlayerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export const createInitialPokerState = (): PokerGameState => ({
    players: [],
    gameStage: 'pre-deal',
    pot: [],
    currentBet: 0,
    lastRaiserId: null,
    lastRaiseAmount: null,
    activePlayerIndex: -1,
    dealerButtonIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    smallBlindAmount: 10,
    bigBlindAmount: 20,
    blindLevel: 1,
    stats: emptyStats(),
    messages: ["Welcome to the Poker Bets Manager! Set up a new game to begin."],
});

// A parsed save with its Sets and newer fields restored.
export const restorePoker = (parsed: PokerGameState): PokerGameState => {
    if (parsed.pot) {
        parsed.pot.forEach((p: Pot) => {
            if (p.eligiblePlayers && !(p.eligiblePlayers instanceof Set)) {
                p.eligiblePlayers = new Set(Array.from(p.eligiblePlayers));
            }
        });
    }
    if (parsed.players) {
        parsed.players = parsed.players.map(p => ({
            ...p,
            phoneNumber: cleanPhone(p.phoneNumber),
            winningStreak: p.winningStreak ?? 0,
            roundWinnings: p.roundWinnings ?? 0 // pots already won this hand count toward its result
        }));
    }
    return { ...parsed, blindLevel: parsed.blindLevel ?? 1, stats: parsed.stats ?? partialStats() };
};

const newPlayer = (id: number, name: string, stack: number, phoneNumber?: string): PokerPlayer => ({
    id, name: toTitleCase(name), stack, totalBuyIn: stack, phoneNumber,
    inHand: false, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false,
    isTakingBreak: false, canOnlyCall: false, winningStreak: 0, roundWinnings: 0,
});

export const newPokerGame = (
    players: { name: string; stack: number; phoneNumber: string }[],
    blinds: { sb: number; bb: number },
    levelMinutes: number | undefined,
    now: number
): PokerGameState => ({
    ...createInitialPokerState(),
    ...startClock(levelMinutes, now),
    players: players.map((p, i) => newPlayer(i + 1, p.name, p.stack, p.phoneNumber)),
    smallBlindAmount: blinds.sb,
    bigBlindAmount: blinds.bb,
    dealerButtonIndex: -1,
    messages: [`Game setup with ${players.length} players. Blinds are ${blinds.sb}/${blinds.bb}. Click 'Start Next Hand' to begin.`]
});

const advanceToNextStageOrShowdown = (currentState: PokerGameState, io: Io): PokerGameState => {
    const currentTotalPot = currentState.players.reduce((sum, p) => sum + p.totalPotContribution, 0);
    io.log(`--- End of Betting Round. Total Pot: ₹${currentTotalPot} ---`);

    const playersInHand = currentState.players.filter(p => p.inHand);
    if (currentState.gameStage === 'river' || playersInHand.filter(p => !p.isAllIn && p.stack > 0).length < 2) {
        io.log("All betting is complete. Calculating final pots for showdown.");
        return { ...currentState, gameStage: 'showdown', pot: calculatePots(currentState.players), activePlayerIndex: -1 };
    }

    const nextStageMap: Record<GameStage, GameStage> = {
        'pre-deal': 'pre-flop', 'pre-flop': 'flop', 'flop': 'turn',
        'turn': 'river', 'river': 'showdown', 'showdown': 'pre-deal',
    };
    const newStage = nextStageMap[currentState.gameStage];
    io.log(`--- Dealing the ${toTitleCase(newStage)} ---`);

    const newPlayers = currentState.players.map(p => ({ ...p, roundBet: 0, hasActed: false, canOnlyCall: false }));
    let newActiveIndex = currentState.dealerButtonIndex;
    do { newActiveIndex = (newActiveIndex + 1) % newPlayers.length; } while (!newPlayers[newActiveIndex].inHand || newPlayers[newActiveIndex].isAllIn);

    io.log(`Action starts with ${toTitleCase(newPlayers[newActiveIndex].name)}.`);
    return { ...currentState, players: newPlayers, gameStage: newStage, currentBet: 0, lastRaiserId: null, lastRaiseAmount: currentState.bigBlindAmount, activePlayerIndex: newActiveIndex };
};

// Everyone else folded: the winner takes the whole pot.
const endOfHand = (winner: PokerPlayer, updatedPlayers: PokerPlayer[], prevGameState: PokerGameState, io: Io): PokerGameState => {
    const totalPot = updatedPlayers.reduce((sum, p) => sum + p.totalPotContribution, 0);

    const rows: RawRecord[] = [];
    updatedPlayers.forEach(p => {
        if (!p.phoneNumber) return;
        const winnings = p.id === winner.id ? totalPot - p.totalPotContribution : -p.totalPotContribution;
        if (winnings !== 0) rows.push({ phone: p.phoneNumber, name: p.name, winnings });
    });
    io.records(rows);

    const finalPlayers = updatedPlayers.map(p => {
        const playerWithReset = { ...p, roundBet: 0, totalPotContribution: 0, inHand: false, isAllIn: false, hasActed: false, canOnlyCall: false };
        const winningStreak = foldOutStreak(p, winner.id, totalPot);
        return p.id === winner.id ? { ...playerWithReset, stack: p.stack + totalPot, winningStreak } : { ...playerWithReset, winningStreak };
    });

    const finalWinner = finalPlayers.find(p => p.id === winner.id)!;
    const nets = handNets(updatedPlayers.map(p => ({ ...p, roundWinnings: p.id === winner.id ? totalPot : 0 })));

    return {
        ...createInitialPokerState(),
        players: finalPlayers.map(p => ({ ...p, roundWinnings: 0 })), // Reset round winnings
        dealerButtonIndex: prevGameState.dealerButtonIndex,
        smallBlindAmount: prevGameState.smallBlindAmount,
        bigBlindAmount: prevGameState.bigBlindAmount,
        levelMinutes: prevGameState.levelMinutes,
        blindLevel: prevGameState.blindLevel,
        levelEndsAt: prevGameState.levelEndsAt,
        pausedRemainingMs: prevGameState.pausedRemainingMs,
        stats: recordRound(prevGameState.stats ?? emptyStats(), nets, handCandidate(updatedPlayers, updatedPlayers.find(p => p.id === winner.id)), statsNames(updatedPlayers)),
        messages: [...prevGameState.messages, `--- HAND OVER ---`, foldOutLine(toTitleCase(winner.name), totalPot, winner.totalPotContribution, finalWinner.stack)],
    };
};

export const playerAction = (prev: PokerGameState, action: PlayerAction, amount: number, io: Io): PokerGameState => {
    const players: PokerPlayer[] = JSON.parse(JSON.stringify(prev.players));
    const player = players[prev.activePlayerIndex];
    if (!player) return prev;

    let newCurrentBet = prev.currentBet;
    let newLastRaiseAmount = prev.lastRaiseAmount;

    player.hasActed = true;
    player.canOnlyCall = false; // Any action resets this flag for the current player

    switch (action) {
        case 'fold':
            player.inHand = false;
            io.log(`${toTitleCase(player.name)} folds.`);
            break;
        case 'check':
            if (player.roundBet < newCurrentBet) {
                io.log("Cannot check, there is a bet to you.");
                return prev;
            }
            io.log(`${toTitleCase(player.name)} checks.`);
            break;
        case 'call': {
            const callAmount = Math.min(newCurrentBet - player.roundBet, player.stack);
            player.stack -= callAmount;
            player.roundBet += callAmount;
            player.totalPotContribution += callAmount;
            if (player.stack === 0) player.isAllIn = true;
            io.log(`${toTitleCase(player.name)} calls ₹${callAmount}.`);
            break;
        }
        case 'bet':
        case 'raise': {
            const isRaiseAction = newCurrentBet > 0;
            const minBetOrRaiseAmount = newLastRaiseAmount || prev.bigBlindAmount;
            const costToPlayer = amount - player.roundBet;

            if (costToPlayer > player.stack) {
                io.log("Cannot bet more than your stack.");
                return prev;
            }

            if (isRaiseAction) {
                const raiseAmount = amount - newCurrentBet;
                if (raiseAmount < minBetOrRaiseAmount) {
                    io.log(`Raise must be by at least ₹${minBetOrRaiseAmount}. Total bet must be at least ₹${newCurrentBet + minBetOrRaiseAmount}.`);
                    return prev;
                }
                newLastRaiseAmount = raiseAmount;
                io.log(`${toTitleCase(player.name)} raises to ₹${amount} (a raise of ₹${costToPlayer}).`);
            } else {
                if (amount < minBetOrRaiseAmount) {
                    io.log(`Bet must be at least ₹${minBetOrRaiseAmount}.`);
                    return prev;
                }
                newLastRaiseAmount = amount;
                io.log(`${toTitleCase(player.name)} bets ₹${amount}.`);
            }

            player.stack -= costToPlayer;
            player.totalPotContribution += costToPlayer;
            player.roundBet = amount;
            if (player.stack === 0) player.isAllIn = true;
            newCurrentBet = amount;
            players.forEach(p => {
                if (p.id !== player.id) {
                    p.hasActed = false;
                    p.canOnlyCall = false;
                }
            });
            break;
        }
        case 'all-in': {
            const allInAmount = player.stack;
            const totalBet = player.roundBet + allInAmount;
            io.log(`${toTitleCase(player.name)} is ALL-IN with their last ₹${allInAmount}.`);
            player.totalPotContribution += allInAmount;
            player.roundBet = totalBet;
            player.stack = 0;
            player.isAllIn = true;
            if (totalBet > newCurrentBet) {
                const raiseAmount = totalBet - newCurrentBet;
                const minRaise = newLastRaiseAmount || prev.bigBlindAmount;
                if (raiseAmount >= minRaise) {
                    // A full raise re-opens the action for everyone.
                    newLastRaiseAmount = raiseAmount;
                    players.forEach(p => {
                        if (p.id !== player.id) {
                            p.hasActed = false;
                            p.canOnlyCall = false;
                        }
                    });
                    io.log(`This is a valid raise. Action re-opened.`);
                } else {
                    // An incomplete raise: whoever already matched the previous bet may only call.
                    players.forEach(p => {
                        if (p.id !== player.id && p.inHand && !p.isAllIn && p.roundBet < totalBet) {
                            p.hasActed = false;
                            p.canOnlyCall = p.roundBet === newCurrentBet;
                        }
                    });
                    io.log(`This all-in is not a full raise. Players may only call or fold.`);
                }
                newCurrentBet = totalBet;
            }
            break;
        }
    }

    const playersLeftInHand = players.filter(p => p.inHand);
    if (playersLeftInHand.length === 1) {
        return endOfHand(playersLeftInHand[0], players, prev, io);
    }

    const activeBettors = players.filter(p => p.inHand && !p.isAllIn);
    const allBetsMatched = activeBettors.every(p => p.roundBet === newCurrentBet);
    const allHaveActed = activeBettors.every(p => p.hasActed);

    if (allBetsMatched && allHaveActed) {
        return advanceToNextStageOrShowdown({ ...prev, players, currentBet: newCurrentBet, lastRaiseAmount: newLastRaiseAmount }, io);
    }

    let nextIndex = prev.activePlayerIndex;
    for (let i = 1; i <= players.length; i++) {
        nextIndex = (prev.activePlayerIndex + i) % players.length;
        if (players[nextIndex].inHand && !players[nextIndex].isAllIn) break;
    }

    io.log(`Action is on ${toTitleCase(players[nextIndex].name)}.`);
    return { ...prev, players, currentBet: newCurrentBet, lastRaiseAmount: newLastRaiseAmount, activePlayerIndex: nextIndex };
};

export const startNewHand = (prev: PokerGameState, io: Io): PokerGameState => {
    const playersWithChips = prev.players.filter(p => p.stack > 0 && !p.isTakingBreak);
    if (playersWithChips.length < 2) {
        io.log("Not enough active players with stacks to start a hand.");
        return prev;
    }
    const { state: leveled, line: levelLine } = tickLevel(prev, io.now());
    const activePlayerIds = new Set(playersWithChips.map(p => p.id));

    let newDealerIndex = prev.dealerButtonIndex;
    do { newDealerIndex = (newDealerIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newDealerIndex].id));

    let newSmallBlindIndex = newDealerIndex;
    do { newSmallBlindIndex = (newSmallBlindIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newSmallBlindIndex].id));

    let newBigBlindIndex = newSmallBlindIndex;
    do { newBigBlindIndex = (newBigBlindIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newBigBlindIndex].id));

    const newPlayers = prev.players.map(p => ({
        ...p,
        inHand: activePlayerIds.has(p.id),
        isAllIn: false,
        roundBet: 0,
        totalPotContribution: 0,
        hasActed: false,
        canOnlyCall: false
    }));

    const sbPlayer = newPlayers[newSmallBlindIndex];
    const sbAmount = Math.min(leveled.smallBlindAmount, sbPlayer.stack);
    sbPlayer.stack -= sbAmount; sbPlayer.roundBet = sbAmount; sbPlayer.totalPotContribution = sbAmount;
    if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;

    const bbPlayer = newPlayers[newBigBlindIndex];
    const bbAmount = Math.min(leveled.bigBlindAmount, bbPlayer.stack);
    bbPlayer.stack -= bbAmount; bbPlayer.roundBet = bbAmount; bbPlayer.totalPotContribution = bbAmount;
    if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;

    let firstToActIndex = newBigBlindIndex;
    do { firstToActIndex = (firstToActIndex + 1) % prev.players.length; } while (!newPlayers[firstToActIndex].inHand);

    newPlayers[newSmallBlindIndex].hasActed = true;

    return {
        ...leveled,
        players: newPlayers,
        gameStage: 'pre-flop',
        pot: [],
        currentBet: leveled.bigBlindAmount,
        lastRaiseAmount: leveled.bigBlindAmount,
        activePlayerIndex: firstToActIndex,
        dealerButtonIndex: newDealerIndex,
        smallBlindIndex: newSmallBlindIndex,
        bigBlindIndex: newBigBlindIndex,
        messages: [
            ...prev.messages,
            `--- NEW HAND (#${prev.dealerButtonIndex + 2}) ---`,
            ...(levelLine ? [levelLine] : []),
            `Dealer button is on ${toTitleCase(newPlayers[newDealerIndex].name)}.`,
            `${toTitleCase(sbPlayer.name)} posts small blind of ₹${sbAmount}.`,
            `${toTitleCase(bbPlayer.name)} posts big blind of ₹${bbAmount}.`,
            `Total Pot: ₹${sbAmount + bbAmount}`,
            `Action is on ${toTitleCase(newPlayers[firstToActIndex].name)}.`,
        ],
    };
};

export const awardPot = (prev: PokerGameState, potIndex: number, winnerIds: number[], io: Io): PokerGameState => {
    const potToAward = prev.pot[potIndex];
    if (!potToAward) return prev;

    // Odd chips go to the winners first left of the dealer button.
    const n = prev.players.length;
    const winnersBySeat = prev.players
        .map((_, i) => prev.players[(prev.dealerButtonIndex + 1 + i + n) % n].id)
        .filter(id => winnerIds.includes(id));
    const shares = splitEvenly(potToAward.amount, winnersBySeat.length);
    const shareOf = new Map(winnersBySeat.map((id, i) => [id, shares[i]]));
    const splitAmount = Math.floor(potToAward.amount / winnersBySeat.length);
    const winnerNames: string[] = [];

    const newPlayers = prev.players.map(p => {
        const share = shareOf.get(p.id);
        if (share === undefined) return p;
        winnerNames.push(toTitleCase(p.name));
        return { ...p, stack: p.stack + share, roundWinnings: p.roundWinnings + share };
    });

    const oddNote = shares.some(s => s !== splitAmount) ? ', odd chips to the first left of the dealer' : '';
    io.log(potLine(winnerNames, potToAward.amount, potToAward.eligiblePlayers.size, splitAmount, oddNote));

    const newPots = prev.pot.filter((_, index) => index !== potIndex);
    if (newPots.length > 0) return { ...prev, players: newPlayers, pot: newPots };

    io.log("All pots awarded. Hand is over.");
    // Whole-hand result: every pot each player won, not just this last one.
    const rows: RawRecord[] = [];
    prev.players.forEach(before => {
        const after = newPlayers.find(p => p.id === before.id);
        if (!before.phoneNumber || !after) return;
        const winnings = after.roundWinnings - before.totalPotContribution;
        if (winnings !== 0) rows.push({ phone: before.phoneNumber, name: before.name, winnings });
    });
    io.records(rows);

    return {
        ...prev,
        players: newPlayers.map(p => ({
            ...p,
            inHand: false,
            isAllIn: false,
            roundBet: 0,
            totalPotContribution: 0,
            hasActed: false,
            canOnlyCall: false,
            winningStreak: nextStreak(p, p.roundWinnings),
            roundWinnings: 0,
        })),
        pot: [],
        gameStage: 'pre-deal',
        activePlayerIndex: -1,
        stats: recordRound(prev.stats ?? emptyStats(), handNets(newPlayers), handCandidate(newPlayers), statsNames(newPlayers)),
    };
};

export const addPlayer = (prev: PokerGameState, name: string, stack: number, phoneNumber: string, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only add players between hands.");
        return prev;
    }
    const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
    io.log(`Player ${toTitleCase(name)} has been added with a buy-in of ₹${stack}.`);
    return { ...prev, players: [...prev.players, newPlayer(newId, name, stack, phoneNumber)] };
};

export const removePlayer = (prev: PokerGameState, playerId: number, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only remove players between hands.");
        return prev;
    }
    const playerToRemove = prev.players.find(p => p.id === playerId);
    if (playerToRemove) io.log(`Player ${toTitleCase(playerToRemove.name)} has been removed from the game.`);
    return { ...prev, players: prev.players.filter(p => p.id !== playerId) };
};

export const addChipsToPlayer = (prev: PokerGameState, playerId: number, amount: number, io: Io): PokerGameState => {
    if (amount <= 0) return prev;
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only add chips between hands.");
        return prev;
    }
    return {
        ...prev,
        players: prev.players.map(p => {
            if (p.id !== playerId) return p;
            io.log(`Added ₹${amount} to ${toTitleCase(p.name)}'s stack. Their total buy-in is now ₹${p.totalBuyIn + amount}.`);
            return { ...p, stack: p.stack + amount, totalBuyIn: p.totalBuyIn + amount };
        }),
    };
};

export const togglePlayerBreak = (prev: PokerGameState, playerId: number, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only take a break between hands.");
        return prev;
    }
    const player = prev.players.find(p => p.id === playerId);
    if (player) io.log(`${toTitleCase(player.name)} is now ${!player.isTakingBreak ? 'on a break' : 'back'}.`);
    return { ...prev, players: prev.players.map(p => (p.id === playerId ? { ...p, isTakingBreak: !p.isTakingBreak } : p)) };
};

export const applyStreakWinnings = (prev: PokerGameState, winnerId: number, amount: number, io: Io): PokerGameState => {
    if (amount <= 0) return prev;
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only give streak winnings between hands.");
        return prev;
    }
    const winner = prev.players.find(p => p.id === winnerId);
    if (!winner) return prev;

    // Players on break don't pay.
    const payerIds = new Set(prev.players.filter(p => p.id !== winnerId && !p.isTakingBreak).map(p => p.id));
    const totalDeducted = amount * payerIds.size;
    const finalPlayers = prev.players.map(p => {
        if (p.id === winnerId) return { ...p, stack: p.stack + totalDeducted };
        return payerIds.has(p.id) ? { ...p, stack: p.stack - amount } : p;
    });

    if (totalDeducted > 0) {
        io.records(prev.players
            .filter(p => p.phoneNumber && (p.id === winnerId || payerIds.has(p.id)))
            .map(p => ({ phone: p.phoneNumber!, name: p.name, winnings: p.id === winnerId ? totalDeducted : -amount })));
    }

    io.log(`Streak Winnings! ${toTitleCase(winner.name)} receives ₹${totalDeducted} (₹${amount} from each of ${payerIds.size} player${payerIds.size === 1 ? '' : 's'}).`);
    return { ...prev, players: finalPlayers };
};

export const pauseBlindClock = (prev: PokerGameState, now: number): PokerGameState =>
    (!prev.levelMinutes || prev.pausedRemainingMs !== undefined) ? prev
        : { ...pauseClock(prev, now), messages: [...prev.messages, 'Blind clock paused.'] };

export const resumeBlindClock = (prev: PokerGameState, now: number): PokerGameState =>
    prev.pausedRemainingMs === undefined ? prev
        : { ...resumeClock(prev, now), messages: [...prev.messages, 'Blind clock resumed.'] };
