// What a state change says and sounds like, read from the log lines it added (same rules as Android).
import { UNDO_LINE } from './log.ts';
import type { Sound } from './feedback.ts';

// Lines in next that prev didn't end with; a replaced log (new game, load, undo) counts only its last line.
export const addedLines = (prev: string[], next: string[]): string[] => {
    if (next === prev || next.length === 0) return [];
    for (let m = Math.min(prev.length, next.length); m > 0; m--) {
        if (next.slice(0, m).every((line, i) => line === prev[prev.length - m + i])) return next.slice(m);
    }
    return prev.length === 0 ? next : next.slice(-1);
};

const TURN_LINE = '--- Turn is now on';

// The newest line that isn't a turn change (else the last line), without a leading "ERROR: ".
export const toastLine = (added: string[]): string | null => {
    if (added.length === 0) return null;
    const line = [...added].reverse().find(l => !l.startsWith(TURN_LINE)) ?? added[added.length - 1];
    return line.replace(/^ERROR: /, '');
};

const PRIORITY: [Sound, RegExp][] = [
    ['error', /^ERROR: |^Can only|must see|^Max (chaal|blind bet)|^Boot is above|already playing|^Keep at least|needs more chips|^(Minimum|Maximum) bet|^Settings can only|has used all|^Rebuys closed|already took the add-on|^Add-ons are open|^Buy-in must|^Players leave a tournament|^No valid bets|^Not enough|off in tournaments/],
    ['win', /won the pot|wins? the pot|win\(s\) the pot|has BLACKJACK!|\) wins ₹|Streak Winnings!/],
    ['alarm', /^Pot limit|^Time.s up/],
    ['level_up', /^Blinds up/],
    ['raise', /raises|all-in|ALL-IN|straddles/],
    ['fold', /folds|busted|loses|surrenders/],
    ['show', /Show is requested|Calculating final pots/],
    ['see', /sees their cards/],
    ['deal', /^--- NEW HAND|^BOMB POT/],
    ['new_round', /^--- NEW ROUND/],
    ['card', /hits|splits/],
    ['chip', /plays blind|bets Chaal|calls|checks|posts|^Antes|bets ₹|doubles|takes the add-on|^Added ₹|stack/],
];

// One sound per batch: the highest-priority match across the added lines.
export const soundFor = (added: string[]): Sound | null => {
    if (added.includes(UNDO_LINE) && added.length === 1) return 'undo';
    return PRIORITY.find(([, pattern]) => added.some(line => pattern.test(line)))?.[0] ?? null;
};
