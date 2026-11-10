// What a state change says and sounds like, read from the log lines it added (same rules as Android).
import { UNDO_LINE } from './log.ts';
import type { Sound } from './feedback.ts';
import { WIN_PATTERN } from './winPattern.ts';

// Lines in next that prev didn't end with; a replaced log (new game, load, undo) counts only its last line.
export const addedLines = (prev: string[], next: string[]): string[] => {
    if (next === prev || next.length === 0) return [];
    for (let m = Math.min(prev.length, next.length); m > 0; m--) {
        if (next.slice(0, m).every((line, i) => line === prev[prev.length - m + i])) return next.slice(m);
    }
    return prev.length === 0 ? next : next.slice(-1);
};

const TURN_LINES = ['--- Turn is now on', 'Action is on ', 'Action starts with ', 'Turn is now on ', 'Player turn: '];

// The newest line that isn't a turn change (else the last line), without a leading "ERROR: ".
export const toastLine = (added: string[]): string | null => {
    if (added.length === 0) return null;
    const line = [...added].reverse().find(l => !TURN_LINES.some(t => l.startsWith(t))) ?? added[added.length - 1];
    return line.replace(/^ERROR: /, '');
};

const PRIORITY: [Sound, RegExp][] = [
    ['error', /^ERROR: |^Can only|must see|^Max (chaal|blind bet)|^Boot is above|already playing|^Keep at least|needs more chips|^(Minimum|Maximum) bet|^Settings can only|has used all|^Rebuys closed|already took the add-on|^Add-ons are open|^Buy-in must|^Players leave a tournament|^No valid bets|^Not enough|off in tournaments|is the banker this round|^Late entry is closed|^The tournament is over|^Side bets can be at most|^Place the hand's bet first|^Insurance is off|does not have enough chips|^Cannot |^Raise must be|^Bet must be|^Bets are locked|is out of chips\.$|^Please place|^Surrender is off|^Insurance is offered once|^No other active players/],
    ['win', WIN_PATTERN],
    ['win', /, wins ₹|insurance pays ₹/], // side-bet and insurance payouts: a win sound, no celebration
    ['alarm', /^Pot limit/],
    ['level_up', /^Blinds up|^Boot is now|is now the banker/],
    ['raise', /raises|all-in|ALL-IN|straddles/],
    ['show', /Show is requested|Calculating final pots/], // above fold, as on Android: a batch with both plays the show
    ['fold', /folds|busted|loses|surrenders|is out in /],
    ['see', /sees their cards/],
    ['deal', /^--- NEW HAND|^BOMB POT|^--- Dealing the /],
    ['new_round', /^--- NEW ROUND/],
    ['card', /hits|splits/],
    ['chip', /plays blind|bets Chaal|calls|posts|^Antes|bets ₹|doubles|takes the add-on|takes insurance|pushes\.|^Deducted ₹|^Added ₹|stack|rebuys: ₹/],
    ['tap', /checks\.|stands\./], // no chips move: a knock
];

// One sound per batch: the highest-priority match across the added lines.
export const soundFor = (added: string[]): Sound | null => {
    if (added.includes(UNDO_LINE) && added.length === 1) return 'undo';
    return PRIORITY.find(([, pattern]) => added.some(line => pattern.test(line)))?.[0] ?? null;
};
