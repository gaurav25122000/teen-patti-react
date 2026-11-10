// Tournament money rules: payouts, places and prizes. Prizes are worked in whole paise.
import type { Entrant, PokerGameState } from './types/pokerGameTypes.ts';
import { formatAmount, toTitleCase } from '../utils/formatters.ts';
import { paise } from '../utils/money.ts';

export const TOURNAMENT_OVER = 'The tournament is over.';
export const GO_OUT = 'Players leave a tournament by going out.';
export const LATE_ENTRY_CLOSED = 'Late entry is closed: a player is already out.';
export const STREAK_OFF = 'Streak winnings are off in tournaments.';
export const IN_PROGRESS = 'Tournament in progress: settle after it ends or chop.';
export const outOfChips = (name: string) => `${toTitleCase(name)} is out of chips.`;

export const defaultPayouts = (entrants: number) =>
    entrants <= 3 ? [100] : entrants <= 5 ? [65, 35] : entrants <= 8 ? [50, 30, 20] : [45, 27, 18, 10];

export const ordinal = (n: number) => {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export const poolPaise = (entrants: Entrant[]) => entrants.reduce((sum, e) => sum + paise(e.paid), 0);

// Paise per place from 1st, floored, leftover to 1st; with fewer entrants than paid places, those that exist share 100%.
export const prizeTable = (pool: number, payouts: number[], entrants: number) => {
    const pcts = payouts.slice(0, Math.max(1, entrants));
    const total = pcts.reduce((a, b) => a + b, 0);
    const prizes = pcts.map(p => Math.floor((pool * p) / total));
    prizes[0] += pool - prizes.reduce((a, b) => a + b, 0);
    return prizes;
};

// The summary's prizes: chop shares in chop-log order ("Asha ₹1200 (chop)"), then paid places ("3rd Dev ₹600").
export const tournamentLine = (entrants: Entrant[], chopOrder: number[] = []) => {
    const won = (e: Entrant | undefined): e is Entrant => !!e && (e.prize ?? 0) >= 0.005;
    const chopped = chopOrder.map(id => entrants.find(e => e.id === id)).filter(won).map(e => `${e.name} ₹${formatAmount(e.prize!)} (chop)`);
    const placed = entrants.filter(e => e.place !== undefined && won(e)).sort((a, b) => a.place! - b.place!)
        .map(e => `${ordinal(e.place!)} ${e.name} ₹${formatAmount(e.prize!)}`);
    return `Tournament: ${[...chopped, ...placed].join(', ')}`;
};

// 0 for the first seat left of the dealer button, then onward.
export const seatFromDealer = (s: Pick<PokerGameState, 'players' | 'dealerButtonIndex'>, id: number) => {
    const n = s.players.length;
    return (s.players.findIndex(p => p.id === id) - s.dealerButtonIndex - 1 + 2 * n) % n;
};
