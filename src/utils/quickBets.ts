// Stepper and quick-chip amounts for the docked action panel.
import { toPaise } from './money.ts';

// One step down, never below the floor; one step up.
export const stepDown = (amount: number, step: number, floor: number) => Math.max(floor, amount - step);
export const stepUp = (amount: number, step: number, floor: number) => Math.max(floor, amount + step);

// Teen Patti: the minimum bet is the stake when blind, twice it when seen; chips are 1×, 2× and 4× of it.
export const teenPattiMinBet = (stake: number, blind: boolean) => (blind ? stake : 2 * stake);
export const teenPattiChips = (minBet: number) => [1, 2, 4].map(k => ({ label: `${k}×`, amount: k * minBet }));

// Poker: ½ POT, POT, 2× and 3× the bet (or the big blind), each clamped to [minimum raise total, all-in total].
export const pokerChips = (s: { pot: number; currentBet: number; bigBlind: number; minTotal: number; maxTotal: number }) => {
    const base = s.currentBet || s.bigBlind;
    const clamp = (v: number) => toPaise(Math.min(s.maxTotal, Math.max(s.minTotal, v)));
    return ([['½ POT', s.pot / 2], ['POT', s.pot], ['2×', 2 * base], ['3×', 3 * base]] as [string, number][]).map(([label, v]) => ({ label, amount: clamp(v) }));
};
