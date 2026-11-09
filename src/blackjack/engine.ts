// Blackjack game steps as pure functions: the hook runs them inside setGameState, tests run them directly.
import type { BlackjackGameState, BlackjackPlayer, PlayerHand, HandStatus, GameStage } from './types/blackjackGameTypes.ts';
import type { Io, RawRecord } from '../utils/engine.ts';
import { toTitleCase } from '../utils/formatters.ts';
import { biggestWin, emptyStats, partialStats, recordRound, statsNames } from '../utils/nightStats.ts';
import { partyKey } from '../utils/owingsLogic.ts';
import { cleanPhone } from '../utils/savedPlayers.ts';
import { depart, departureNote, tooFewToRemove } from '../utils/departures.ts';

// A player's chips counting bets still on the table (open wagers and unresolved insurance).
export const chipsWithBets = (p: BlackjackPlayer) => p.stack + p.hands.reduce((sum, h) =>
    sum + (h.status === 'playing' || h.status === 'stand' ? h.wager : 0) + (h.insurance && !h.insuranceResult ? h.insurance : 0), 0);

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
    players.every(p => p.isTakingBreak || p.hands.every(h => !(h.status === 'playing' || h.status === 'stand' || (h.insurance && !h.insuranceResult))));

export const newBlackjackGame = (players: { name: string; stack: number; phoneNumber: string; numHands: number }[]): BlackjackGameState => {
    const initial = createInitialBlackjackState();
    return {
        ...initial,
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
        messages: [`Game setup with ${players.length} players. Bets are locked to ₹${initial.minBet}. Click 'Deal Cards' to play or 'Change Bets' to unlock.`]
    };
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

export const startRound = (prev: BlackjackGameState, io: Io): BlackjackGameState => {
    let activePlayerFound = false;
    let totalHands = 0;
    let handsWithBets = 0;

    const newPlayers = prev.players.map(p => {
        const totalLastBet = p.lastBets.slice(0, p.initialHandsCount).reduce((a, b) => a + b, 0);
        const placed = p.hands.some(h => h.bet > 0); // unlocked bets already came out of the stack
        if (p.isTakingBreak || (prev.isBettingLocked ? p.stack < totalLastBet : !placed && p.stack < prev.minBet)) {
            if (p.isTakingBreak) io.log(`${p.name} is on break.`);
            else io.log(`${p.name} has insufficient chips to play.`);
            // Bets already placed on a skipped player's hands go back to them.
            return { ...p, stack: p.stack + p.hands.reduce((sum, h) => sum + h.bet, 0), hands: [] };
        }

        let currentHands = p.hands.length === 0 ? Array.from({ length: p.initialHandsCount }, (_, i) => emptyHand(p.id, i)) : p.hands;

        if (prev.isBettingLocked) {
            // Locked: each hand bets its last bet while the stack lasts.
            let playerStack = p.stack;
            currentHands = currentHands.map((h, i) => {
                const betAmount = p.lastBets[i] || p.lastBets[0] || prev.minBet;
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
        });
        if (p.hands.some(h => h.bet > 0)) nets[partyKey(p.name, p.phoneNumber)] = roundNet;
        if (p.phoneNumber && roundNet !== 0) rows.push({ phone: p.phoneNumber, name: p.name, winnings: roundNet });
        return { ...p, hands: [], lastBets: p.lastBets.map((oldBet, i) => newLastBets.get(i) || oldBet) };
    });
    io.records(rows);

    return {
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
    let newDealerNet = prev.dealerNet;
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
            const newHand: PlayerHand = { id: `${player.id}-hand-split-${io.now()}`, cards: [], bet: hand.bet, wager: hand.bet, status: 'playing', hasHit: false };
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
            newDealerNet += hand.bet / 2;
            break;
        case 'insurance': {
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
                return endRoundAndPay({ ...prev, players: newPlayers, dealerNet: newDealerNet, gameStage: 'dealer-turn' }, io);
            }
        }
    }
    return { ...prev, players: newPlayers, gameStage: nextStage, currentPlayerId: nextPlayerId, currentHandId: nextHandId, dealerNet: newDealerNet };
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

    const next = { ...prev, players: newPlayers, dealerNet: prev.dealerNet + dealerNetChange };
    if (areAllHandsSettled(newPlayers)) {
        io.log("All hands settled.");
        return endRoundAndPay(next, io);
    }
    return next;
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
    const next = { ...prev, players: newPlayers, dealerNet: prev.dealerNet + dealerNetChange };
    if (areAllHandsSettled(newPlayers)) {
        io.log("All hands settled.");
        return endRoundAndPay(next, io);
    }
    return next;
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
    return {
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
        departed: depart(prev.departed, { name: leaver.name, phone: leaver.phoneNumber, net }),
    };
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
            stack: p.stack + p.hands.reduce((sum, h) => sum + h.bet, 0),
            hands: Array.from({ length: p.initialHandsCount }, (_, i) => emptyHand(p.id, i)),
        })),
        isBettingLocked: false,
    };
};
