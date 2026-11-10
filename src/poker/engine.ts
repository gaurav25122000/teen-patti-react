// Poker game steps as pure functions: the hook runs them inside setGameState, tests run them directly.
import type { Entrant, PokerGameState, PokerPlayer, GameStage, Pot } from './types/pokerGameTypes.ts';
import type { Io, RawRecord } from '../utils/engine.ts';
import { calculatePots } from './utils/pokerLogic.ts';
import { formatAmount, toTitleCase } from '../utils/formatters.ts';
import { MID_ROUND, pokerChange, type PokerSettings } from '../utils/gameSettings.ts';
import { splitEvenly, toPaise } from '../utils/money.ts';
import { defaultPayouts, GO_OUT, LATE_ENTRY_CLOSED, ordinal, outOfChips, poolPaise, prizeTable, seatFromDealer, STREAK_OFF, TOURNAMENT_OVER } from './tournament.ts';
import { foldOutLine, foldOutStreak, handCandidate, handNets, nextStreak, potLine } from './utils/streak.ts';
import { pauseClock, resumeClock, startClock, tickLevel } from './utils/blindLevels.ts';
import { emptyStats, partialStats, recordRound, statsNames } from '../utils/nightStats.ts';
import { cleanPhone } from '../utils/savedPlayers.ts';
import { depart, departureNote, tooFewToRemove } from '../utils/departures.ts';

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

// "Tournament: ₹B for C chips." then the tournament items as a Settings line.
const tournamentSetupLines = (t: PokerSettings) => {
    const cash = { ...t, buyIn: undefined, startingChips: undefined, addOnPrice: undefined, addOnChips: undefined, payouts: undefined };
    return [`Tournament: ₹${formatAmount(t.buyIn!)} for ${formatAmount(t.startingChips!)} chips.`, pokerChange(cash, t)!];
};

const entrant = (p: PokerPlayer, paid: number): Entrant => ({ id: p.id, name: p.name, phone: p.phoneNumber, paid, chips: p.stack });

// In a tournament everyone starts with the starting chips for the buy-in; setup stacks are ignored.
export const newPokerGame = (players: { name: string; stack: number; phoneNumber: string }[], settings: PokerSettings, now: number): PokerGameState => {
    const seated = players.map((p, i) => newPlayer(i + 1, p.name, settings.tournament ? settings.startingChips! : p.stack, p.phoneNumber));
    return {
        ...createInitialPokerState(),
        ...settings,
        ...startClock(settings.levelMinutes, now),
        startedAt: now,
        players: seated,
        entrants: settings.tournament ? seated.map(p => entrant(p, settings.buyIn!)) : undefined,
        dealerButtonIndex: -1,
        messages: [
            `Game setup with ${players.length} players. Blinds are ${settings.smallBlindAmount}/${settings.bigBlindAmount}. Click 'Start Next Hand' to begin.`,
            ...(settings.tournament ? tournamentSetupLines(settings) : []),
        ],
    };
};

export const pokerSettingsOf = (s: PokerGameState): PokerSettings => ({
    smallBlindAmount: s.smallBlindAmount, bigBlindAmount: s.bigBlindAmount, levelMinutes: s.levelMinutes, ante: s.ante, straddle: s.straddle,
    turnTimer: s.turnTimer, maxRebuys: s.maxRebuys, rebuyUntilLevel: s.rebuyUntilLevel, addOnAmount: s.addOnAmount,
    minBuyIn: s.minBuyIn, maxBuyIn: s.maxBuyIn, bombEvery: s.bombEvery, bombAmount: s.bombAmount,
    tournament: s.tournament, buyIn: s.buyIn, startingChips: s.startingChips, addOnPrice: s.addOnPrice, addOnChips: s.addOnChips, payouts: s.payouts,
});

// Setup stacks, joining stacks and rebuys must sit within the buy-in limits.
export const buyInRefusal = (s: Pick<PokerSettings, 'minBuyIn' | 'maxBuyIn'>, amount: number) =>
    s.minBuyIn !== undefined && amount < s.minBuyIn ? `Buy-in must be at least ₹${formatAmount(s.minBuyIn)}.`
        : s.maxBuyIn !== undefined && amount > s.maxBuyIn ? `Buy-in must be at most ₹${formatAmount(s.maxBuyIn)}.` : null;

// Between hands only. Changing the level minutes restarts the current level now; clearing them stops the clock.
export const applySettings = (prev: PokerGameState, settings: PokerSettings, now: number, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log(MID_ROUND);
        return prev;
    }
    const line = pokerChange(pokerSettingsOf(prev), settings);
    const clock = settings.levelMinutes === prev.levelMinutes ? {}
        : { levelEndsAt: settings.levelMinutes ? now + settings.levelMinutes * 60_000 : undefined, pausedRemainingMs: undefined };
    return { ...prev, ...settings, tournament: prev.tournament, ...clock, messages: line ? [...prev.messages, line] : prev.messages };
};

export const toggleBombNext = (prev: PokerGameState, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal' || prev.bombAmount === undefined) return prev;
    io.log(prev.bombNext ? 'Next hand is no longer a bomb pot.' : 'Next hand is a bomb pot.');
    return { ...prev, bombNext: !prev.bombNext };
};

// --- Tournament ---
const say = (s: PokerGameState, ...lines: string[]): PokerGameState => ({ ...s, messages: [...s.messages, ...lines] });
const payoutsOf = (s: PokerGameState) => s.payouts ?? defaultPayouts(s.entrants!.length);
const paidMore = (entrants: Entrant[], id: number, money: number, chips: number) =>
    entrants.map(e => (e.id === id ? { ...e, paid: toPaise(e.paid + money), chips: e.chips + chips } : e));

// One Lifetime Winnings row per entrant once the tournament ends: prize less money paid.
const tournamentRecords = (entrants: Entrant[], io: Io) => io.records(entrants
    .filter(e => e.phone && Math.abs(e.prize! - e.paid) >= 0.005)
    .map(e => ({ phone: e.phone!, name: e.name, winnings: toPaise(e.prize! - e.paid) })));

const finishTournament = (s: PokerGameState, io: Io): PokerGameState => {
    const winner = s.players.find(p => p.stack > 0)!;
    const table = prizeTable(poolPaise(s.entrants!), payoutsOf(s), s.entrants!.length);
    const entrants = s.entrants!.map(e => {
        const place = e.id === winner.id ? 1 : e.place!;
        return { ...e, place, prize: (table[place - 1] ?? 0) / 100 };
    });
    const paidPlaces = entrants.filter(e => e.prize > 0).sort((a, b) => a.place - b.place);
    tournamentRecords(entrants, io);
    return say({ ...s, entrants, tournamentOver: true },
        `Tournament over: ${paidPlaces.map(e => `${ordinal(e.place)} ${e.name} ₹${formatAmount(e.prize)}`).join(', ')}`);
};

// Places for the last hand's busted players, best first: place = players still in + 1.
const placeBusted = (s: PokerGameState, io: Io): PokerGameState => {
    const ranked = s.bust!.ranked;
    const stillIn = s.players.filter(p => p.stack > 0).length;
    const placeOf = new Map(ranked.map((id, i) => [id, stillIn + 1 + i]));
    const entrants = s.entrants!.map(e => (placeOf.has(e.id) ? { ...e, place: placeOf.get(e.id) } : e));
    const lines = ranked.map(id => `${s.entrants!.find(e => e.id === id)!.name} is out in ${ordinal(placeOf.get(id)!)} place.`);
    const next = say({ ...s, entrants, bust: undefined }, ...lines);
    return stillIn === 1 ? finishTournament(next, io) : next;
};

// After a tournament hand: who went to 0, ranked by chips at the start of the hand, then seat left of the dealer.
const tournamentHandEnd = (s: PokerGameState, startChips: Map<number, number>, io: Io): PokerGameState => {
    if (!s.entrants) return s;
    const start = (id: number) => startChips.get(id) ?? 0;
    const busted = s.players.filter(p => start(p.id) > 0 && p.stack === 0)
        .sort((a, b) => start(b.id) - start(a.id) || seatFromDealer(s, a.id) - seatFromDealer(s, b.id));
    if (busted.length === 0) return s;
    const next = { ...s, bust: { ranked: busted.map(p => p.id), awaiting: busted.filter(p => !rebuyLimit(s, p)).map(p => p.id) } };
    return next.bust.awaiting.length ? next : placeBusted(next, io);
};

// The bust prompt's REBUY (₹B for the starting chips) or OUT.
export const bustChoice = (prev: PokerGameState, playerId: number, rebuy: boolean, io: Io): PokerGameState => {
    const bust = prev.bust;
    const player = prev.players.find(p => p.id === playerId);
    if (!bust?.awaiting.includes(playerId) || !player) return prev;
    let s: PokerGameState = { ...prev, bust: { ...bust, awaiting: bust.awaiting.filter(id => id !== playerId) } };
    if (rebuy) {
        const chips = prev.startingChips!;
        s = say({
            ...s,
            players: s.players.map(p => (p.id === playerId ? { ...p, stack: p.stack + chips, totalBuyIn: p.totalBuyIn + chips, rebuys: (p.rebuys ?? 0) + 1 } : p)),
            entrants: paidMore(s.entrants!, playerId, prev.buyIn!, chips),
            bust: { ranked: bust.ranked.filter(id => id !== playerId), awaiting: s.bust!.awaiting },
        }, `${player.name} rebuys: ₹${formatAmount(prev.buyIn!)} for ${formatAmount(chips)} chips.`);
    }
    return s.bust!.awaiting.length ? s : placeBusted(s, io);
};

// Ends early: decided places get their prize; the rest goes by chips, floored, leftover to the chip leader (first-listed on a tie).
export const chop = (prev: PokerGameState, io: Io): PokerGameState => {
    if (!prev.entrants || prev.tournamentOver) return prev;
    if (prev.gameStage !== 'pre-deal' || prev.bust) {
        io.log('Can only chop between hands.');
        return prev;
    }
    const s = prev;
    const pool = poolPaise(s.entrants!);
    const table = prizeTable(pool, payoutsOf(s), s.entrants!.length);
    const decided = (e: Entrant) => (e.place === undefined ? 0 : table[e.place - 1] ?? 0);
    const rest = pool - s.entrants!.reduce((sum, e) => sum + decided(e), 0);
    const remaining = s.players.filter(p => p.stack > 0).sort((a, b) => b.stack - a.stack);
    const chips = remaining.reduce((sum, p) => sum + p.stack, 0);
    const shares = remaining.map(p => Math.floor((rest * p.stack) / chips));
    shares[0] += rest - shares.reduce((a, b) => a + b, 0);
    const shareOf = new Map(remaining.map((p, i) => [p.id, shares[i]]));
    const entrants = s.entrants!.map(e => ({ ...e, prize: (e.place === undefined ? shareOf.get(e.id) ?? 0 : decided(e)) / 100 }));
    tournamentRecords(entrants, io);
    return say({ ...s, entrants, tournamentOver: true, chopOrder: remaining.map(p => p.id) },
        `Chop: ${remaining.map((p, i) => `${p.name} ₹${formatAmount(shares[i] / 100)}`).join(', ')}`);
};

// A tournament replaced or ended unfinished: the hand's chips go back, open bust prompts go out, then it is chopped.
export const endTournament = (prev: PokerGameState, io: Io): PokerGameState => {
    if (!prev.entrants || prev.tournamentOver) return prev;
    const players = prev.players.map(p => ({ ...p, stack: p.stack + p.totalPotContribution - p.roundWinnings, totalPotContribution: 0, roundWinnings: 0 }));
    const between: PokerGameState = { ...prev, gameStage: 'pre-deal', pot: [], players };
    const placed = between.bust ? placeBusted({ ...between, bust: { ...between.bust, awaiting: [] } }, io) : between;
    return placed.tournamentOver ? placed : chop(placed, io);
};

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
    if (!prevGameState.entrants) io.records(rows); // tournament chips are never money

    const finalPlayers = updatedPlayers.map(p => {
        const playerWithReset = { ...p, roundBet: 0, totalPotContribution: 0, inHand: false, isAllIn: false, hasActed: false, canOnlyCall: false };
        const winningStreak = foldOutStreak(p, winner.id, totalPot);
        return p.id === winner.id ? { ...playerWithReset, stack: p.stack + totalPot, winningStreak } : { ...playerWithReset, winningStreak };
    });

    const finalWinner = finalPlayers.find(p => p.id === winner.id)!;
    const nets = handNets(updatedPlayers.map(p => ({ ...p, roundWinnings: p.id === winner.id ? totalPot : 0 })));

    // Back between hands; settings, the clock, departures and counters carry on.
    return tournamentHandEnd({
        ...prevGameState,
        players: finalPlayers.map(p => ({ ...p, roundWinnings: 0 })),
        gameStage: 'pre-deal',
        pot: [],
        currentBet: 0,
        lastRaiserId: null,
        lastRaiseAmount: null,
        activePlayerIndex: -1,
        smallBlindIndex: -1,
        bigBlindIndex: -1,
        optionHolderId: undefined,
        stats: recordRound(prevGameState.stats ?? emptyStats(), nets, handCandidate(updatedPlayers, updatedPlayers.find(p => p.id === winner.id)), statsNames(updatedPlayers)),
        messages: [...prevGameState.messages, `--- HAND OVER ---`, foldOutLine(toTitleCase(winner.name), totalPot, winner.totalPotContribution, finalWinner.stack)],
    }, new Map(updatedPlayers.map(p => [p.id, p.stack + p.totalPotContribution])), io);
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

    // One player left who can act and already matches: nobody could answer them, so no option either.
    if (allBetsMatched && (allHaveActed || activeBettors.length <= 1)) {
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

// Antes and blinds (and a straddle), or a bomb pot straight to the flop. The dealer button always moves.
export const startNewHand = (prev: PokerGameState, io: Io): PokerGameState => {
    if (prev.tournamentOver) {
        io.log(TOURNAMENT_OVER);
        return prev;
    }
    if (prev.bust?.awaiting.length) {
        io.log(outOfChips(prev.players.find(p => p.id === prev.bust!.awaiting[0])!.name));
        return prev;
    }
    const playersWithChips = prev.players.filter(p => p.stack > 0 && !p.isTakingBreak);
    if (playersWithChips.length < 2) {
        io.log("Not enough active players with stacks to start a hand.");
        return prev;
    }
    const { state: leveled, line: levelLine } = tickLevel(prev, io.now());
    const handNumber = (prev.handNumber ?? 0) + 1;
    const bomb = prev.bombAmount !== undefined && (!!prev.bombNext || (!!prev.bombEvery && handNumber % prev.bombEvery === 0));
    const activePlayerIds = new Set(playersWithChips.map(p => p.id));
    const n = prev.players.length;

    let newDealerIndex = prev.dealerButtonIndex;
    do { newDealerIndex = (newDealerIndex + 1) % n; } while (!activePlayerIds.has(prev.players[newDealerIndex].id));

    const newPlayers = prev.players.map(p => ({
        ...p, inHand: activePlayerIds.has(p.id), isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false, canOnlyCall: false,
    }));
    const dealtIn = newPlayers.filter(p => p.inHand);
    const name = (i: number) => toTitleCase(newPlayers[i].name);
    // The next seat after `from` that `ok` accepts (one always exists here).
    const nextSeat = (from: number, ok: (p: PokerPlayer) => boolean) => {
        let i = from;
        do { i = (i + 1) % n; } while (!ok(newPlayers[i]));
        return i;
    };
    // Puts up to `amount` from the stack into the pot; live money also counts as this street's bet.
    const post = (p: PokerPlayer, amount: number, live: boolean) => {
        const paid = Math.min(amount, p.stack);
        p.stack -= paid;
        p.totalPotContribution += paid;
        if (live) p.roundBet += paid;
        if (p.stack === 0) p.isAllIn = true;
        return paid;
    };
    const messages = [...prev.messages, `--- NEW HAND (#${handNumber}) ---`, ...(levelLine ? [levelLine] : []), `Dealer button is on ${name(newDealerIndex)}.`];
    const base = { ...leveled, players: newPlayers, pot: [], dealerButtonIndex: newDealerIndex, handNumber, bombNext: false, messages };

    if (bomb) {
        dealtIn.forEach(p => post(p, prev.bombAmount!, false));
        messages.push(`BOMB POT: ₹${formatAmount(prev.bombAmount!)} from ${dealtIn.length} players. Straight to the flop.`);
        const flop = { ...base, currentBet: 0, lastRaiseAmount: leveled.bigBlindAmount, smallBlindIndex: -1, bigBlindIndex: -1, optionHolderId: undefined };
        if (dealtIn.filter(p => !p.isAllIn).length < 2) {
            messages.push("All betting is complete. Calculating final pots for showdown.");
            return { ...flop, gameStage: 'showdown', pot: calculatePots(newPlayers), activePlayerIndex: -1 };
        }
        const first = nextSeat(newDealerIndex, p => p.inHand && !p.isAllIn);
        messages.push(`Action starts with ${name(first)}.`);
        return { ...flop, gameStage: 'flop', activePlayerIndex: first };
    }

    if (prev.ante) {
        dealtIn.forEach(p => post(p, prev.ante!, false));
        messages.push(`Antes: ₹${formatAmount(prev.ante)} from ${dealtIn.length} players.`);
    }
    const newSmallBlindIndex = nextSeat(newDealerIndex, p => activePlayerIds.has(p.id));
    const newBigBlindIndex = nextSeat(newSmallBlindIndex, p => activePlayerIds.has(p.id));
    const sbPlayer = newPlayers[newSmallBlindIndex];
    const bbPlayer = newPlayers[newBigBlindIndex];
    messages.push(`${name(newSmallBlindIndex)} posts small blind of ₹${post(sbPlayer, leveled.smallBlindAmount, true)}.`);
    messages.push(`${name(newBigBlindIndex)} posts big blind of ₹${post(bbPlayer, leveled.bigBlindAmount, true)}.`);

    let currentBet = leveled.bigBlindAmount;
    let lastBlindIndex = newBigBlindIndex;
    let optionHolder = bbPlayer;
    if (prev.straddle && dealtIn.length >= 3) {
        const straddleIndex = nextSeat(newBigBlindIndex, p => p.inHand);
        const straddler = newPlayers[straddleIndex];
        const amount = 2 * leveled.bigBlindAmount;
        if (straddler.stack > amount) {
            post(straddler, amount, true);
            currentBet = amount;
            lastBlindIndex = straddleIndex;
            optionHolder = straddler;
            messages.push(`${name(straddleIndex)} straddles ₹${formatAmount(amount)}.`);
        } else {
            messages.push(`No straddle this hand: ${name(straddleIndex)} is short.`);
        }
    }
    sbPlayer.hasActed = true;

    messages.push(`Total Pot: ₹${newPlayers.reduce((sum, p) => sum + p.totalPotContribution, 0)}`);
    const blinds = { ...base, currentBet, lastRaiseAmount: currentBet, smallBlindIndex: newSmallBlindIndex, bigBlindIndex: newBigBlindIndex, optionHolderId: optionHolder.id };
    // Antes and blinds can put players all-in: nobody left to act, or one player already matching, means showdown.
    const canAct = dealtIn.filter(p => !p.isAllIn);
    if (canAct.length === 0 || (canAct.length === 1 && canAct[0].roundBet >= Math.max(...dealtIn.map(p => p.roundBet)))) {
        messages.push("All betting is complete. Calculating final pots for showdown.");
        return { ...blinds, gameStage: 'showdown', pot: calculatePots(newPlayers), activePlayerIndex: -1 };
    }
    const firstToActIndex = nextSeat(lastBlindIndex, p => p.inHand && !p.isAllIn);
    messages.push(`Action is on ${name(firstToActIndex)}.`);
    return { ...blinds, gameStage: 'pre-flop', activePlayerIndex: firstToActIndex };
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
    if (!prev.entrants) io.records(rows);

    const startChips = new Map(newPlayers.map(p => [p.id, p.stack - p.roundWinnings + p.totalPotContribution]));
    return tournamentHandEnd({
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
    }, startChips, io);
};

export const addPlayer = (prev: PokerGameState, name: string, stack: number, phoneNumber: string, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only add players between hands.");
        return prev;
    }
    if (prev.tournamentOver) {
        io.log(TOURNAMENT_OVER);
        return prev;
    }
    const limit = prev.entrants ? null : buyInRefusal(prev, stack);
    if (limit) {
        io.log(limit);
        return prev;
    }
    const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
    if (prev.entrants) {
        if (prev.bust || prev.entrants.some(e => e.place !== undefined)) {
            io.log(LATE_ENTRY_CLOSED); // places count the players still in, so the field is fixed from the first bust
            return prev;
        }
        const joined = newPlayer(newId, name, prev.startingChips!, phoneNumber);
        io.log(`Player ${toTitleCase(name)} joins for ₹${formatAmount(prev.buyIn!)} with ${formatAmount(prev.startingChips!)} chips.`);
        return { ...prev, players: [...prev.players, joined], entrants: [...prev.entrants, entrant(joined, prev.buyIn!)] };
    }
    io.log(`Player ${toTitleCase(name)} has been added with a buy-in of ₹${stack}.`);
    return { ...prev, players: [...prev.players, newPlayer(newId, name, stack, phoneNumber)] };
};

export const removePlayer = (prev: PokerGameState, playerId: number, io: Io): PokerGameState => {
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only remove players between hands.");
        return prev;
    }
    const leaver = prev.players.find(p => p.id === playerId);
    if (!leaver) return prev;
    if (prev.players.length <= 1) {
        io.log(tooFewToRemove(1));
        return prev;
    }
    if (prev.entrants) {
        // An entrant who is out keeps their place, payment and prize; anyone else goes out first.
        if (prev.entrants.find(e => e.id === playerId)?.place === undefined) {
            io.log(GO_OUT);
            return prev;
        }
        io.log(`Player ${toTitleCase(leaver.name)} has been removed from the game.`);
        return { ...prev, players: prev.players.filter(p => p.id !== playerId) };
    }
    const net = leaver.stack - leaver.totalBuyIn;
    io.log(`Player ${toTitleCase(leaver.name)} has been removed from the game.${departureNote(net)}`);
    return {
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
        departed: depart(prev.departed, { name: leaver.name, phone: leaver.phoneNumber, net }),
    };
};

// Why a player may not rebuy (count limit, or level cut-off with a blind clock), or null.
const rebuyLimit = (s: PokerGameState, player: PokerPlayer) => {
    if (s.maxRebuys !== undefined && (player.rebuys ?? 0) >= s.maxRebuys) return `${toTitleCase(player.name)} has used all ${s.maxRebuys} rebuys.`;
    if (s.rebuyUntilLevel !== undefined && s.levelMinutes && s.blindLevel > s.rebuyUntilLevel) return `Rebuys closed after level ${s.rebuyUntilLevel}.`;
    return null;
};

// Why a cash rebuy is refused (limits above, then buy-in limits), or null.
export const rebuyRefusal = (s: PokerGameState, player: PokerPlayer, amount: number) => rebuyLimit(s, player) ?? buyInRefusal(s, amount);

// A rebuy (Manage Rebuys): adds chips and buy-in, and counts toward the rebuy limit.
export const addChipsToPlayer = (prev: PokerGameState, playerId: number, amount: number, io: Io): PokerGameState => {
    if (amount <= 0 || prev.entrants) return prev; // tournament rebuys go through the bust prompt
    if (prev.gameStage !== 'pre-deal') {
        io.log("Can only add chips between hands.");
        return prev;
    }
    const player = prev.players.find(p => p.id === playerId);
    if (!player) return prev;
    const refused = rebuyRefusal(prev, player, amount);
    if (refused) {
        io.log(refused);
        return prev;
    }
    io.log(`Added ₹${amount} to ${toTitleCase(player.name)}'s stack. Their total buy-in is now ₹${player.totalBuyIn + amount}.`);
    return {
        ...prev,
        players: prev.players.map(p => (p.id === playerId ? { ...p, stack: p.stack + amount, totalBuyIn: p.totalBuyIn + amount, rebuys: (p.rebuys ?? 0) + 1 } : p)),
    };
};

// Why an add-on is refused, or null: once per player, and only in level L+1 when rebuys close after level L.
export const addOnRefusal = (s: PokerGameState, player: PokerPlayer) => {
    if (player.tookAddOn) return `${toTitleCase(player.name)} already took the add-on.`;
    if (s.rebuyUntilLevel !== undefined && s.levelMinutes && s.blindLevel !== s.rebuyUntilLevel + 1) return `Add-ons are open in level ${s.rebuyUntilLevel + 1}.`;
    return null;
};

// Cash: A chips for ₹A. Tournament: K chips for ₹P, for players still in.
export const takeAddOn = (prev: PokerGameState, playerId: number, io: Io): PokerGameState => {
    const player = prev.players.find(p => p.id === playerId);
    const price = prev.entrants ? prev.addOnPrice : prev.addOnAmount;
    const chips = prev.entrants ? prev.addOnChips : prev.addOnAmount;
    if (!player || !price || !chips || prev.entrants?.find(e => e.id === playerId)?.place !== undefined) return prev;
    const refused = prev.tournamentOver ? TOURNAMENT_OVER : prev.gameStage !== 'pre-deal' ? "Can only add chips between hands." : addOnRefusal(prev, player);
    if (refused) {
        io.log(refused);
        return prev;
    }
    io.log(`${toTitleCase(player.name)} takes the add-on: ₹${formatAmount(price)}${prev.entrants ? ` for ${formatAmount(chips)} chips` : ''}.`);
    return {
        ...prev,
        players: prev.players.map(p => (p.id === playerId ? { ...p, stack: p.stack + chips, totalBuyIn: p.totalBuyIn + chips, tookAddOn: true } : p)),
        entrants: prev.entrants && paidMore(prev.entrants, playerId, price, chips),
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
    if (prev.entrants) {
        io.log(STREAK_OFF);
        return prev;
    }
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
