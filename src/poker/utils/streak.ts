import type { PokerPlayer } from '../types/pokerGameTypes';
import { toTitleCase } from '../../utils/formatters.ts';

type StreakFields = Pick<PokerPlayer, 'winningStreak' | 'isTakingBreak' | 'stack' | 'totalPotContribution'>;

// Dealt into the hand: not on break and had chips (a busted player has chips in the pot).
const dealtIn = (p: StreakFields) => !p.isTakingBreak && (p.stack > 0 || p.totalPotContribution > 0);

// Ending the hand up money extends the streak, anyone else dealt in resets, players not dealt in keep theirs.
export const nextStreak = (p: StreakFields, won: number) =>
    !dealtIn(p) ? p.winningStreak : (won > p.totalPotContribution ? p.winningStreak + 1 : 0);

// Night summary round nets: each dealt-in player's winnings minus their chips in the pot.
export const handNets = (players: (StreakFields & { name: string; roundWinnings: number })[]) =>
    Object.fromEntries(players.filter(dealtIn).map(p => [toTitleCase(p.name), p.roundWinnings - p.totalPotContribution]));

// The hand's biggest-pot candidate: the player who won the most, with the whole pot.
export const handCandidate = (players: { name: string; roundWinnings: number }[], totalPot: number) => {
    const top = players.reduce<{ name: string; roundWinnings: number } | null>((best, p) => (!best || p.roundWinnings > best.roundWinnings ? p : best), null);
    return top ? { name: toTitleCase(top.name), amount: totalPot } : null;
};

// Everyone else folded: the last player wins the whole pot, the rest win nothing.
export const foldOutStreak = (p: StreakFields & { id: number }, winnerId: number, totalPot: number) =>
    nextStreak(p, p.id === winnerId ? totalPot : 0);

export const foldOutLine = (name: string, totalPot: number, contribution: number, finalStack: number) =>
    totalPot > contribution
        ? `${name} wins the pot of ₹${totalPot}. Their final stack is ₹${finalStack}.`
        : `Everyone folded; ${name} takes back their own ₹${totalPot}. Their final stack is ₹${finalStack}.`;

// A one-player pot (uncalled excess, sometimes with folded players' chips) is no contest, so not a win line.
export const potLine = (winnerNames: string[], amount: number, eligibleCount: number, splitAmount: number, oddNote: string) =>
    eligibleCount === 1
        ? `₹${amount} goes to ${winnerNames[0]}, the only player left in this pot.`
        : `${winnerNames.join(' & ')} win(s) the pot of ₹${amount} (Split: ₹${splitAmount} each${oddNote}).`;
