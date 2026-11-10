// Blackjack game steps as pure functions: the hook runs them inside setGameState, tests run them directly.
import type { BlackjackGameState, BlackjackPlayer, PlayerHand, HandStatus, GameStage, SideResult } from './types/blackjackGameTypes.ts';
import type { Io, RawRecord } from '../utils/engine.ts';
import { formatAmount, toTitleCase } from '../utils/formatters.ts';
import { blackjackChange, MID_ROUND, type BlackjackSettings } from '../utils/gameSettings.ts';
import { biggestWin, emptyStats, partialStats, recordRound, statsNames } from '../utils/nightStats.ts';
import { partyKey } from '../utils/owingsLogic.ts';
import { cleanPhone } from '../utils/savedPlayers.ts';
import { depart, departureNote, tooFewToRemove } from '../utils/departures.ts';

// Side bet payouts (x:1) by result.
export const PAIR_PAYS: Partial<Record<SideResult, number>> = { mixed: 6, coloured: 12, perfect: 25 };
export const THREE_PAYS: Partial<Record<SideResult, number>> = { flush: 5, straight: 10, trips: 30, 'straight-flush': 40, 'suited-trips': 100 };
const SIDE_LABELS: Record<SideResult, string> = {
    lose: 'lose', mixed: 'mixed pair', coloured: 'coloured pair', perfect: 'perfect pair',
    flush: 'flush', straight: 'straight', trips: 'three of a kind', 'straight-flush': 'straight flush', 'suited-trips': 'suited trips',
};
export type SideKind = 'pp' | 't3';
const RESULT_KEY = { pp: 'ppResult', t3: 't3Result' } as const;
const sideOpen = (h: PlayerHand, kind: SideKind) => (h[kind] && !h[RESULT_KEY[kind]] ? h[kind]! : 0);
// A settled side bet's net for the player: bet × ratio won, or the bet lost.
const sideNet = (h: PlayerHand, kind: SideKind) => {
    const result = h[RESULT_KEY[kind]];
    if (!h[kind] || !result) return 0;
    return result === 'lose' ? -h[kind]! : h[kind]! * ((kind === 'pp' ? PAIR_PAYS : THREE_PAYS)[result] ?? 0);
};
// Money a hand has on the table before the deal: its bet and side bets.
const placedOn = (h: PlayerHand) => h.bet + (h.pp ?? 0) + (h.t3 ?? 0);

// A player's chips counting bets still on the table (open wagers, unresolved insurance and side bets).
export const chipsWithBets = (p: BlackjackPlayer) => p.stack + p.hands.reduce((sum, h) =>
    sum + (h.status === 'playing' || h.status === 'stand' ? h.wager : 0) + (h.insurance && !h.insuranceResult ? h.insurance : 0) + sideOpen(h, 'pp') + sideOpen(h, 't3'), 0);

// The house side of a result: the banker's stack when a player banks, else dealerNet.
const toHouse = (s: BlackjackGameState, players: BlackjackPlayer[], amount: number) =>
    s.bankerId === undefined
        ? { players, dealerNet: s.dealerNet + amount }
        : { players: players.map(p => (p.id === s.bankerId ? { ...p, stack: p.stack + amount } : p)), dealerNet: s.dealerNet };

const bankerRefusal = (name: string) => `${name} is the banker this round.`;

// The next player by seat after afterId (from the first seat when absent) who isn't on a break.
const nextBanker = (players: BlackjackPlayer[], afterId?: number) => {
    const start = afterId === undefined ? -1 : players.findIndex(p => p.id === afterId);
    for (let i = 1; i <= players.length; i++) {
        const p = players[(start + i) % players.length];
        if (!p.isTakingBreak) return p;
    }
    return undefined;
};

// Between rounds: the banker's placed bets go back and their turn starts at 0 rounds.
const withBanker = (s: BlackjackGameState, banker: BlackjackPlayer | undefined): BlackjackGameState => banker ? {
    ...s,
    bankerId: banker.id,
    bankerRounds: 0,
    players: s.players.map(p => (p.id === banker.id ? { ...p, stack: p.stack + p.hands.reduce((sum, h) => sum + placedOn(h), 0), hands: [] } : p)),
    messages: [...s.messages, `${banker.name} is now the banker for ${s.bankerEvery} rounds.`],
} : { ...s, bankerId: undefined, bankerRounds: 0 };

export type HandAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance';

export const createInitialBlackjackState = (): BlackjackGameState => ({
    players: [],
    dealerHand: { cards: [], status: 'playing', score: 0 },
    gameStage: 'betting',
    messages: ["Welcome to the Blackjack Bets Manager! Set up a new game to begin."],
    currentPlayerId: null,
    currentHandId: null,
    minBet: 10,
    maxBet: 1000,
    allowSurrender: true,
    blackjackPayout: '3to2',
    dealerNet: 0,
    isBettingLocked: true,
    insurance: true,
    defaultHands: 1,
    sideBets: false,
    stats: emptyStats(),
});

// A parsed save with older fields upgraded, or null when it holds no game.
export const restoreBlackjack = (parsed: Omit<BlackjackGameState, 'players'> & { players: (BlackjackPlayer & { lastBet?: number })[] }): BlackjackGameState | null => {
    if (!parsed || !parsed.players) return null;
    const initialState = createInitialBlackjackState();
    return {
        ...initialState,
        ...parsed,
        players: parsed.players.map(p => ({
            ...p,
            phoneNumber: cleanPhone(p.phoneNumber) ?? '',
            isTakingBreak: p.isTakingBreak || false,
            lastBets: p.lastBets || (p.lastBet ? [p.lastBet] : [initialState.minBet]),
            lastBet: undefined,
            hands: p.hands.map(h => ({ ...h, wager: h.wager || h.bet || 0 })),
        })),
        dealerNet: parsed.dealerNet || 0,
        stats: parsed.stats ?? partialStats(),
        isBettingLocked: parsed.isBettingLocked !== undefined ? parsed.isBettingLocked : true,
    };
};

const handNumber = (handId: string) => Number(handId.split('-').pop()) + 1;

const emptyHand = (playerId: number, index: number): PlayerHand =>
    ({ id: `${playerId}-hand-${index}`, cards: [], bet: 0, wager: 0, status: 'playing', hasHit: false });

const areAllHandsSettled = (players: BlackjackPlayer[]): boolean =>
    players.every(p => p.isTakingBreak || p.hands.every(h => !(h.status === 'playing' || h.status === 'stand' || (h.insurance && !h.insuranceResult) || sideOpen(h, 'pp') || sideOpen(h, 't3'))));

const finishIfSettled = (next: BlackjackGameState, io: Io): BlackjackGameState => {
    if (!areAllHandsSettled(next.players)) return next;
    io.log("All hands settled.");
    return endRoundAndPay(next, io);
};

export const blackjackSettingsOf = (s: BlackjackGameState): BlackjackSettings => ({
    blackjackPayout: s.blackjackPayout, allowSurrender: s.allowSurrender, minBet: s.minBet, maxBet: s.maxBet,
    insurance: s.insurance, defaultHands: s.defaultHands, bankerEvery: s.bankerEvery, sideBets: s.sideBets,
});

// Between rounds only. Side bets turned off go back; a banker starts (or restarts) when "banker every" changes.
export const applySettings = (prev: BlackjackGameState, settings: BlackjackSettings, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') {
        io.log(MID_ROUND);
        return prev;
    }
    const line = blackjackChange(blackjackSettingsOf(prev), settings);
    let next: BlackjackGameState = { ...prev, ...settings, messages: line ? [...prev.messages, line] : prev.messages };
    if (!settings.sideBets) {
        next = { ...next, players: next.players.map(p => ({
            ...p,
            stack: p.stack + p.hands.reduce((sum, h) => sum + (h.pp ?? 0) + (h.t3 ?? 0), 0),
            hands: p.hands.map(h => ({ ...h, pp: undefined, t3: undefined })),
        })) };
    }
    if (settings.bankerEvery === prev.bankerEvery) return next;
    if (!settings.bankerEvery) return { ...next, bankerId: undefined, bankerRounds: 0 };
    return withBanker(next, next.players.find(p => p.id === prev.bankerId) ?? nextBanker(next.players));
};

export const newBlackjackGame = (players: { name: string; stack: number; phoneNumber: string; numHands: number }[], settings?: BlackjackSettings, startedAt?: number): BlackjackGameState => {
    const initial = { ...createInitialBlackjackState(), ...settings };
    const game: BlackjackGameState = {
        ...initial,
        startedAt,
        players: players.map((p, i) => ({
            id: i + 1,
            name: toTitleCase(p.name),
            stack: p.stack,
            totalBuyIn: p.stack,
            phoneNumber: p.phoneNumber,
            initialHandsCount: p.numHands,
            hands: [],
            isTakingBreak: false,
            lastBets: Array(p.numHands).fill(initial.minBet),
        })),
        messages: [`Game setup with ${players.length} players. Bets are locked to ₹${initial.minBet}. Click DEAL to play or CHANGE BETS to unlock.`]
    };
    return game.bankerEvery ? withBanker(game, nextBanker(game.players)) : game;
};

export const placeBet = (prev: BlackjackGameState, playerId: number, handIndex: number, amount: number, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') {
        io.log("Can only place bets before the deal.");
        return prev;
    }
    if (prev.isBettingLocked) {
        io.log("Bets are locked. Click 'Change Bets' to unlock.");
        return prev;
    }
    if (amount < prev.minBet || amount > prev.maxBet) {
        io.log(`Bet must be between ${prev.minBet} and ${prev.maxBet}.`);
        return prev;
    }
    const bettor = prev.players.find(p => p.id === playerId);
    if (bettor && bettor.id === prev.bankerId) {
        io.log(bankerRefusal(bettor.name));
        return prev;
    }
    return {
        ...prev,
        players: prev.players.map(p => {
            if (p.id !== playerId) return p;
            const hand = p.hands[handIndex] ?? emptyHand(p.id, handIndex);
            // A new bet on a hand replaces its old one, which goes back to the stack first.
            if (p.stack + hand.bet < amount) {
                io.log(`${p.name} does not have enough chips.`);
                return p;
            }
            // Hands before this one get empty slots, never gaps.
            const hands = Array.from({ length: Math.max(p.hands.length, handIndex + 1) }, (_, i) => p.hands[i] ?? emptyHand(p.id, i));
            hands[handIndex] = { ...hand, bet: amount, wager: amount };
            return { ...p, hands, stack: p.stack + hand.bet - amount };
        }),
    };
};

// Perfect Pairs or 21+3 on a hand that has its bet; 0 clears it, a new amount replaces the old.
export const placeSideBet = (prev: BlackjackGameState, playerId: number, handIndex: number, kind: SideKind, amount: number, io: Io): BlackjackGameState => {
    const player = prev.players.find(p => p.id === playerId);
    if (!prev.sideBets || !player || amount < 0) return prev;
    const hand = player.hands[handIndex];
    const refusal = prev.gameStage !== 'betting' ? "Can only place bets before the deal."
        : prev.isBettingLocked ? "Bets are locked. Click 'Change Bets' to unlock."
        : player.id === prev.bankerId ? bankerRefusal(player.name)
        : !hand || hand.bet <= 0 ? "Place the hand's bet first."
        : amount > prev.maxBet ? `Side bets can be at most ₹${formatAmount(prev.maxBet)}.`
        : player.stack + (hand[kind] ?? 0) < amount ? `${player.name} does not have enough chips.` : null;
    if (refusal) {
        io.log(refusal);
        return prev;
    }
    return {
        ...prev,
        players: prev.players.map(p => (p.id !== playerId ? p : {
            ...p,
            stack: p.stack + (hand[kind] ?? 0) - amount,
            hands: p.hands.map((h, i) => (i === handIndex ? { ...h, [kind]: amount || undefined } : h)),
        })),
    };
};

// The host marks a side bet: a win pays bet × ratio from the house (or banker), a loss goes to them.
export const settleSideBet = (prev: BlackjackGameState, playerId: number, handId: string, kind: SideKind, result: SideResult, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'player-turn' && prev.gameStage !== 'dealer-turn') return prev;
    const player = prev.players.find(p => p.id === playerId);
    const hand = player?.hands.find(h => h.id === handId);
    const ratio = result === 'lose' ? 0 : (kind === 'pp' ? PAIR_PAYS : THREE_PAYS)[result];
    if (!player || !hand || !sideOpen(hand, kind) || ratio === undefined) return prev;
    const bet = hand[kind]!;
    const label = `${player.name} (Hand ${handNumber(handId)}) ${kind === 'pp' ? 'Perfect Pairs' : '21+3'}`;
    io.log(ratio ? `${label}: ${SIDE_LABELS[result]}, wins ₹${formatAmount(bet * ratio)}.` : `${label} loses ₹${formatAmount(bet)}.`);
    const players = prev.players.map(p => (p.id !== playerId ? p : {
        ...p,
        stack: p.stack + (ratio ? bet * (1 + ratio) : 0),
        hands: p.hands.map(h => (h.id === handId ? { ...h, [RESULT_KEY[kind]]: result } : h)),
    }));
    return finishIfSettled({ ...prev, ...toHouse(prev, players, ratio ? -bet * ratio : bet) }, io);
};

// A locked hand repeats its last bet, brought within the table's current limits.
const repeatBet = (s: BlackjackGameState, p: BlackjackPlayer, i: number) =>
    Math.min(s.maxBet, Math.max(s.minBet, p.lastBets[i] || p.lastBets[0] || s.minBet));

export const startRound = (prev: BlackjackGameState, io: Io): BlackjackGameState => {
    let activePlayerFound = false;
    let totalHands = 0;
    let handsWithBets = 0;

    const newPlayers = prev.players.map(p => {
        if (p.id === prev.bankerId) return { ...p, stack: p.stack + p.hands.reduce((sum, h) => sum + placedOn(h), 0), hands: [] };
        const totalLastBet = p.lastBets.slice(0, p.initialHandsCount).reduce((sum, _, i) => sum + repeatBet(prev, p, i), 0);
        const placed = p.hands.some(h => h.bet > 0); // unlocked bets already came out of the stack
        if (p.isTakingBreak || (prev.isBettingLocked ? p.stack < totalLastBet : !placed && p.stack < prev.minBet)) {
            if (p.isTakingBreak) io.log(`${p.name} is on break.`);
            else io.log(`${p.name} has insufficient chips to play.`);
            // Bets already placed on a skipped player's hands go back to them.
            return { ...p, stack: p.stack + p.hands.reduce((sum, h) => sum + placedOn(h), 0), hands: [] };
        }

        let currentHands = p.hands.length === 0 ? Array.from({ length: p.initialHandsCount }, (_, i) => emptyHand(p.id, i)) : p.hands;

        if (prev.isBettingLocked) {
            // Locked: each hand bets its last bet while the stack lasts.
            let playerStack = p.stack;
            currentHands = currentHands.map((h, i) => {
                const betAmount = repeatBet(prev, p, i);
                if (playerStack >= betAmount) {
                    playerStack -= betAmount;
                    activePlayerFound = true;
                    handsWithBets++;
                    return { ...h, bet: betAmount, wager: betAmount };
                }
                return { ...h, bet: 0, wager: 0 };
            });
            totalHands += currentHands.length;
            return { ...p, hands: currentHands, stack: playerStack };
        }
        totalHands += currentHands.length;
        currentHands.forEach(h => {
            if (h.bet > 0) {
                activePlayerFound = true;
                handsWithBets++;
            }
        });
        return { ...p, hands: currentHands };
    });

    if (prev.isBettingLocked) {
        if (!activePlayerFound) {
            io.log("No players had enough chips to auto-bet. Round not started.");
            return { ...prev, players: newPlayers };
        }
        io.log(`--- NEW ROUND ---`);
        io.log(`Auto-betting ${handsWithBets} hand(s) with last used bet.`);
    } else {
        if (!activePlayerFound) {
            io.log("Please place a bet for at least one hand to start.");
            return { ...prev, players: newPlayers };
        }
        if (handsWithBets < totalHands) {
            io.log(`Please place bets for all ${totalHands} active hands.`);
            return { ...prev, players: newPlayers };
        }
        io.log(`--- NEW ROUND ---`);
        io.log(`Locking ${handsWithBets} hand(s). Dealing cards...`);
    }

    const firstPlayer = newPlayers.find(p => !p.isTakingBreak && p.hands.some(h => h.bet > 0));
    const firstHand = firstPlayer?.hands.find(h => h.bet > 0);
    if (!firstPlayer || !firstHand) {
        io.log("An unexpected error occurred. No valid hands found.");
        return prev;
    }

    return {
        ...prev,
        players: newPlayers.map(p => ({ ...p, hands: p.hands.filter(h => h.bet > 0).map(h => ({ ...h, status: 'playing' as const, hasHit: false })) })),
        dealerHand: { cards: ['?', '?'], status: 'playing', score: 0 },
        gameStage: 'player-turn',
        currentPlayerId: firstPlayer.id,
        currentHandId: firstHand.id,
        isBettingLocked: true,
        messages: [...prev.messages, `Player turn: ${toTitleCase(firstPlayer.name)}, Hand 1`]
    };
};

const findNextHand = (players: BlackjackPlayer[], currentPlayerId: number, currentHandId: string): { nextPlayerId: number | null; nextHandId: string | null } => {
    const currentPlayerIndex = players.findIndex(p => p.id === currentPlayerId);
    if (currentPlayerIndex === -1) return { nextPlayerId: null, nextHandId: null };
    const currentPlayer = players[currentPlayerIndex];
    const currentHandIndex = currentPlayer.hands.findIndex(h => h.id === currentHandId);
    for (let i = currentHandIndex + 1; currentHandIndex !== -1 && i < currentPlayer.hands.length; i++) {
        if (currentPlayer.hands[i].status === 'playing') return { nextPlayerId: currentPlayerId, nextHandId: currentPlayer.hands[i].id };
    }
    for (let i = currentPlayerIndex + 1; i < players.length; i++) {
        const nextPlayer = players[i];
        if (nextPlayer.isTakingBreak) continue;
        const hand = nextPlayer.hands.find(h => h.status === 'playing');
        if (hand) return { nextPlayerId: nextPlayer.id, nextHandId: hand.id };
    }
    return { nextPlayerId: null, nextHandId: null };
};

// The round is settled: record each player's round net and clear the hands.
const endRoundAndPay = (endState: BlackjackGameState, io: Io): BlackjackGameState => {
    const rows: RawRecord[] = [];
    const nets: Record<string, number> = {}; // players who bet this round
    let tableNet = 0; // the players' total, which the banker takes the other side of

    const finalPlayers = endState.players.map(p => {
        let roundNet = 0;
        const newLastBets = new Map<number, number>();
        p.hands.forEach((h, i) => {
            if (h.bet > 0) newLastBets.set(i, h.bet);
            if (h.status === 'win') roundNet += h.wager;
            else if (h.status === 'blackjack') roundNet += (endState.blackjackPayout === '3to2' ? h.bet * 1.5 : h.bet * 1.2); // pays on the original bet
            else if (h.status === 'lose' || h.status === 'busted') roundNet -= h.wager;
            else if (h.status === 'surrendered') roundNet -= h.bet / 2;
            // Insurance pays 2:1, settled separately from the hand
            if (h.insuranceResult === 'won') roundNet += h.insurance! * 2;
            else if (h.insuranceResult === 'lost') roundNet -= h.insurance!;
            roundNet += sideNet(h, 'pp') + sideNet(h, 't3');
        });
        tableNet += roundNet;
        if (p.hands.some(h => h.bet > 0)) nets[partyKey(p.name, p.phoneNumber)] = roundNet;
        if (p.phoneNumber && roundNet !== 0) rows.push({ phone: p.phoneNumber, name: p.name, winnings: roundNet });
        return { ...p, hands: [], lastBets: p.lastBets.map((oldBet, i) => newLastBets.get(i) || oldBet) };
    });
    const banker = endState.players.find(p => p.id === endState.bankerId);
    if (banker) {
        nets[partyKey(banker.name, banker.phoneNumber)] = -tableNet;
        if (banker.phoneNumber && tableNet !== 0) rows.push({ phone: banker.phoneNumber, name: banker.name, winnings: -tableNet });
    }
    io.records(rows);

    const next: BlackjackGameState = {
        ...endState,
        players: finalPlayers,
        gameStage: 'betting',
        currentPlayerId: null,
        currentHandId: null,
        dealerHand: { cards: [], status: 'playing', score: 0 },
        isBettingLocked: true,
        stats: recordRound(endState.stats ?? emptyStats(), nets, biggestWin(nets), statsNames(endState.players)),
        messages: [...endState.messages, "--- ROUND OVER ---", `Bets locked to last amount. Click 'Change Bets' to unlock.`]
    };
    if (!next.bankerEvery) return next;
    const rounds = (endState.bankerRounds ?? 0) + 1;
    return banker && rounds < next.bankerEvery ? { ...next, bankerRounds: rounds } : withBanker(next, nextBanker(next.players, banker?.id));
};

export const playerAction = (prev: BlackjackGameState, action: HandAction, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'player-turn' || !prev.currentPlayerId || !prev.currentHandId) return prev;
    let newPlayers = [...prev.players];
    const player = newPlayers.find(p => p.id === prev.currentPlayerId);
    if (!player) return prev;
    const hand = player.hands.find(h => h.id === prev.currentHandId);
    if (!hand || hand.status !== 'playing') return prev;

    let nextPlayerId: number | null = prev.currentPlayerId;
    let nextHandId: string | null = prev.currentHandId;
    let nextStage: GameStage = 'player-turn';
    let houseGain = 0;
    const label = `${player.name} (Hand ${handNumber(hand.id)})`;

    const updateHand = (updates: Partial<PlayerHand>) => {
        newPlayers = newPlayers.map(p => (p.id === player.id ? { ...p, hands: p.hands.map(h => (h.id === hand.id ? { ...h, ...updates } : h)) } : p));
    };
    const updateStack = (stack: number) => {
        newPlayers = newPlayers.map(p => (p.id === player.id ? { ...p, stack } : p));
    };

    switch (action) {
        case 'hit':
            io.log(`${label} hits.`);
            updateHand({ hasHit: true });
            break;
        case 'stand':
            io.log(`${label} stands.`);
            updateHand({ status: 'stand' });
            break;
        case 'double':
            if (hand.hasHit) {
                io.log("Cannot double down after hitting.");
                return prev;
            }
            if (player.stack < hand.bet) {
                io.log("Not enough stack to double down.");
                return prev;
            }
            io.log(`${label} doubles down.`);
            updateStack(player.stack - hand.bet);
            updateHand({ wager: hand.bet * 2, status: 'stand' });
            break;
        case 'split': {
            if (hand.hasHit) {
                io.log("Cannot split after hitting.");
                return prev;
            }
            if (player.stack < hand.bet) {
                io.log("Not enough stack to split.");
                return prev;
            }
            const currentHandIndex = player.hands.findIndex(h => h.id === prev.currentHandId);
            if (currentHandIndex === -1) return prev;
            io.log(`${label} splits.`);
            const newHand: PlayerHand = { id: `${player.id}-split-${player.hands.length}`, cards: [], bet: hand.bet, wager: hand.bet, status: 'playing', hasHit: false };
            newPlayers = newPlayers.map(p => {
                if (p.id !== player.id) return p;
                const hands = [...p.hands];
                hands.splice(currentHandIndex + 1, 0, newHand); // played right after the hand it split from
                return { ...p, stack: player.stack - newHand.bet, hands };
            });
            return { ...prev, players: newPlayers };
        }
        case 'surrender':
            if (!prev.allowSurrender) {
                io.log("Surrender is not allowed.");
                return prev;
            }
            if (hand.hasHit) {
                io.log("Cannot surrender after hitting.");
                return prev;
            }
            io.log(`${label} surrenders.`);
            updateStack(player.stack + hand.bet / 2); // half the original bet back
            updateHand({ status: 'surrendered' });
            houseGain += hand.bet / 2;
            break;
        case 'insurance': {
            if (!prev.insurance) {
                io.log("Insurance is off at this table.");
                return prev;
            }
            if (hand.hasHit || hand.insurance) {
                io.log("Insurance is offered once per hand, before hitting.");
                return prev;
            }
            const insurance = hand.bet / 2;
            if (player.stack < insurance) {
                io.log("Not enough stack for insurance.");
                return prev;
            }
            io.log(`${label} takes insurance for ₹${insurance}.`);
            updateStack(player.stack - insurance);
            updateHand({ insurance });
            break;
        }
    }

    const updatedHand = newPlayers.find(p => p.id === player.id)?.hands.find(h => h.id === hand.id);
    if (updatedHand && updatedHand.status !== 'playing') {
        const next = findNextHand(newPlayers, player.id, hand.id);
        if (next.nextPlayerId && next.nextHandId) {
            nextPlayerId = next.nextPlayerId;
            nextHandId = next.nextHandId;
            const nextPlayer = newPlayers.find(p => p.id === next.nextPlayerId)!;
            io.log(`Turn is now on ${toTitleCase(nextPlayer.name)}, Hand #${handNumber(next.nextHandId)}`);
        } else {
            nextStage = 'dealer-turn';
            nextPlayerId = null;
            nextHandId = null;
            io.log("All players have acted. Dealer's turn. Settle all hands.");
            if (areAllHandsSettled(newPlayers)) {
                io.log("All hands settled.");
                return endRoundAndPay({ ...prev, ...toHouse(prev, newPlayers, houseGain), gameStage: 'dealer-turn' }, io);
            }
        }
    }
    return { ...prev, ...toHouse(prev, newPlayers, houseGain), gameStage: nextStage, currentPlayerId: nextPlayerId, currentHandId: nextHandId };
};

export const setHandStatus = (prev: BlackjackGameState, playerId: number, handId: string, status: HandStatus, io: Io): BlackjackGameState => {
    let playerWonAmount: number | null = null; // the total amount added to the stack
    let dealerNetChange = 0;
    let finalStatus = status;
    let handBet = 0; // the original bet
    let handWager = 0; // the total at risk (bet, or 2x when doubled)

    const newPlayers = prev.players.map(p => {
        if (p.id !== playerId) return p;
        const hands = p.hands.map(h => {
            if (h.id !== handId) return h;
            handBet = h.bet;
            handWager = h.wager;
            if (h.status === 'surrendered') {
                playerWonAmount = 0; // already settled at the surrender
                finalStatus = 'surrendered';
                return h;
            }
            if (status === 'blackjack') {
                const winAmount = handBet * (prev.blackjackPayout === '3to2' ? 1.5 : 1.2);
                playerWonAmount = handWager + winAmount;
                dealerNetChange = -winAmount;
            } else if (status === 'win') {
                playerWonAmount = handWager * 2;
                dealerNetChange = -handWager;
            } else if (status === 'lose' || status === 'busted') {
                playerWonAmount = 0;
                dealerNetChange = handWager;
            } else if (status === 'push') {
                playerWonAmount = handWager;
            }
            return { ...h, status: finalStatus };
        });
        return { ...p, hands, stack: p.stack + (playerWonAmount ?? 0) };
    });

    if (playerWonAmount !== null) {
        const player = prev.players.find(p => p.id === playerId)!;
        const label = `${player.name} (Hand ${handNumber(handId)})`;
        const won: number = playerWonAmount;
        if (finalStatus === 'blackjack') io.log(`${label} has BLACKJACK! Wins ₹${won - handWager}`);
        else if (finalStatus === 'win') io.log(`${label} wins ₹${won - handWager}`);
        else if (finalStatus === 'push') io.log(`${label} pushes.`);
        else if (finalStatus === 'lose') io.log(`${label} loses ₹${handWager}`);
        else if (finalStatus === 'busted') io.log(`${label} busted and loses ₹${handWager}`);
        else if (finalStatus === 'surrendered') io.log(`${label} surrendered and loses ₹${handBet / 2}`);
    }

    return finishIfSettled({ ...prev, ...toHouse(prev, newPlayers, dealerNetChange) }, io);
};

// Host answers whether the dealer had blackjack: insured hands get the side bet back plus 2:1, or lose it.
export const settleInsurance = (prev: BlackjackGameState, dealerHasBlackjack: boolean, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'dealer-turn') return prev;
    let dealerNetChange = 0;
    const newPlayers = prev.players.map(p => {
        let stack = p.stack;
        const hands = p.hands.map(h => {
            if (!h.insurance || h.insuranceResult) return h;
            if (dealerHasBlackjack) {
                stack += h.insurance * 3;
                dealerNetChange -= h.insurance * 2;
                io.log(`${p.name} (Hand ${handNumber(h.id)}) insurance pays ₹${h.insurance * 2}.`);
                return { ...h, insuranceResult: 'won' as const };
            }
            dealerNetChange += h.insurance;
            io.log(`${p.name} (Hand ${handNumber(h.id)}) loses insurance of ₹${h.insurance}.`);
            return { ...h, insuranceResult: 'lost' as const };
        });
        return { ...p, stack, hands };
    });
    return finishIfSettled({ ...prev, ...toHouse(prev, newPlayers, dealerNetChange) }, io);
};

export const addPlayer = (prev: BlackjackGameState, name: string, stack: number, phoneNumber: string, numHands: number, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') {
        io.log("Can only add players between rounds.");
        return prev;
    }
    const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
    io.log(`Player ${toTitleCase(name)} has been added with a buy-in of ₹${stack}.`);
    return {
        ...prev,
        players: [...prev.players, {
            id: newId, name: toTitleCase(name), stack, totalBuyIn: stack, phoneNumber,
            initialHandsCount: numHands, hands: [], isTakingBreak: false, lastBets: Array(numHands).fill(prev.minBet),
        }],
    };
};

export const removePlayer = (prev: BlackjackGameState, playerId: number, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') {
        io.log("Can only remove players between rounds.");
        return prev;
    }
    const leaver = prev.players.find(p => p.id === playerId);
    if (!leaver) return prev;
    if (prev.players.length <= 1) {
        io.log(tooFewToRemove(1));
        return prev;
    }
    const net = chipsWithBets(leaver) - leaver.totalBuyIn;
    io.log(`Player ${toTitleCase(leaver.name)} has been removed.${departureNote(net)}`);
    const players = prev.players.filter(p => p.id !== playerId);
    const next = { ...prev, players, departed: depart(prev.departed, { name: leaver.name, phone: leaver.phoneNumber, net }) };
    if (leaver.id !== prev.bankerId) return next;
    const seat = prev.players.indexOf(leaver); // the banker role moves to the next seat at once
    return withBanker(next, nextBanker(players, players[seat - 1]?.id));
};

export const addChipsToPlayer = (prev: BlackjackGameState, playerId: number, amount: number, io: Io): BlackjackGameState => {
    if (amount <= 0) return prev;
    if (prev.gameStage !== 'betting') {
        io.log("Can only add chips between rounds.");
        return prev;
    }
    return {
        ...prev,
        players: prev.players.map(p => {
            if (p.id !== playerId) return p;
            io.log(`Added ₹${amount} to ${toTitleCase(p.name)}'s stack. Total buy-in: ₹${p.totalBuyIn + amount}.`);
            return { ...p, stack: p.stack + amount, totalBuyIn: p.totalBuyIn + amount };
        }),
    };
};

export const togglePlayerBreak = (prev: BlackjackGameState, playerId: number, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') {
        io.log("Can only take a break between rounds.");
        return prev;
    }
    const player = prev.players.find(p => p.id === playerId);
    if (player) io.log(`${toTitleCase(player.name)} is now ${!player.isTakingBreak ? 'on a break' : 'back'}.`);
    return { ...prev, players: prev.players.map(p => (p.id === playerId ? { ...p, isTakingBreak: !p.isTakingBreak } : p)) };
};

export const updatePlayerHandCount = (prev: BlackjackGameState, playerId: number, numHands: number, io: Io): BlackjackGameState => {
    if (numHands < 1) return prev;
    if (prev.gameStage !== 'betting') {
        io.log("Can only change hand count between rounds.");
        return prev;
    }
    const player = prev.players.find(p => p.id === playerId);
    if (player) io.log(`${toTitleCase(player.name)} will now play ${numHands} hand(s) per round.`);
    return {
        ...prev,
        players: prev.players.map(p => {
            if (p.id !== playerId) return p;
            const lastBets = [...p.lastBets];
            const defaultBet = lastBets[0] || prev.minBet;
            while (lastBets.length < numHands) lastBets.push(defaultBet);
            lastBets.length = numHands;
            return { ...p, initialHandsCount: numHands, lastBets };
        }),
    };
};

// Refunds every placed bet and gives each player empty hands to bet on.
export const unlockAllBets = (prev: BlackjackGameState, io: Io): BlackjackGameState => {
    if (prev.gameStage !== 'betting') return prev;
    io.log("Bets unlocked. Place new bets for all active hands.");
    return {
        ...prev,
        players: prev.players.map(p => ({
            ...p,
            stack: p.stack + p.hands.reduce((sum, h) => sum + placedOn(h), 0),
            hands: p.id === prev.bankerId ? [] : Array.from({ length: p.initialHandsCount }, (_, i) => emptyHand(p.id, i)),
        })),
        isBettingLocked: false,
    };
};
