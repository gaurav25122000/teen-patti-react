import type { PokerPlayer } from '../types/pokerGameTypes';
import { partyKey } from '../../utils/owingsLogic.ts';

type StreakFields = Pick<PokerPlayer, 'winningStreak' | 'isTakingBreak' | 'stack' | 'totalPotContribution'>;

// Dealt into the hand: not on break and had chips (a busted player has chips in the pot).
const dealtIn = (p: StreakFields) => !p.isTakingBreak && (p.stack > 0 || p.totalPotContribution > 0);

// Ending the hand up money extends the streak, anyone else dealt in resets, players not dealt in keep theirs.
export const nextStreak = (p: StreakFields, won: number) =>
    !dealtIn(p) ? p.winningStreak : (won > p.totalPotContribution ? p.winningStreak + 1 : 0);

type HandResult = StreakFields & { name: string; phoneNumber?: string; roundWinnings: number };
const handNet = (p: HandResult) => p.roundWinnings - p.totalPotContribution;
const keyOf = (p: HandResult) => partyKey(p.name, p.phoneNumber);

// Night summary round nets by party key: each dealt-in player's winnings minus their chips in the pot.
export const handNets = (players: HandResult[]) =>
    Object.fromEntries(players.filter(dealtIn).map(p => [keyOf(p), handNet(p)]));

// Biggest-pot candidate: the contested pot (the top bet's uncalled part went back to its owner), named for the
// fold-out winner, else the dealt-in player with the largest net; ties go to the most chips taken back, then seat.
export const handCandidate = (players: HandResult[], foldOutWinner?: HandResult) => {
    const bets = players.map(p => p.totalPotContribution).sort((a, b) => b - a);
    const amount = bets.reduce((sum, b) => sum + b, 0) - ((bets[0] ?? 0) - (bets[1] ?? 0));
    const better = (p: HandResult, best: HandResult) =>
        handNet(p) > handNet(best) || (handNet(p) === handNet(best) && p.roundWinnings > best.roundWinnings);
    const top = foldOutWinner ?? players.filter(dealtIn).reduce<HandResult | null>((best, p) => (!best || better(p, best) ? p : best), null);
    return top ? { key: keyOf(top), amount } : null;
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
