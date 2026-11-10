// Per-game settings: parsing the form, and the "Settings: …" line naming what changed. Blank means off.
import { formatAmount } from './formatters.ts';

export const MID_ROUND = 'Settings can only change between rounds.';

export interface TeenPattiSettings {
    defaultBoot?: number;
    potLimit?: number;
    maxBlindTurns?: number;
    maxChaal?: number;
    turnTimer?: number; // seconds
    bootRiseEvery?: number; // rounds
    bootRiseStep?: number;
}

export interface PokerSettings {
    smallBlindAmount: number;
    bigBlindAmount: number;
    levelMinutes?: number;
    ante?: number;
    straddle?: boolean;
    turnTimer?: number;
    maxRebuys?: number;
    rebuyUntilLevel?: number;
    addOnAmount?: number;
    minBuyIn?: number;
    maxBuyIn?: number;
    bombEvery?: number; // hands
    bombAmount?: number;
}

export interface BlackjackSettings {
    blackjackPayout: '3to2' | '6to5';
    allowSurrender: boolean;
    minBet: number;
    maxBet: number;
    insurance: boolean;
    defaultHands: number;
    bankerEvery?: number; // rounds; off means the house banks
    sideBets: boolean;
}

export type Form = Record<string, string>;

const AMOUNT = 'Amounts must be positive numbers.';
const COUNT = 'Counts must be whole numbers of at least 1.';
const TIMER = 'Turn timer must be 5 to 300 seconds.';

// A blank field is off; otherwise a number, or an error.
const num = (text: string | undefined): number | undefined | null => {
    const t = (text ?? '').trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
};

type Check = (n: number) => boolean;
const positive: Check = n => n > 0;
const wholeAtLeast1: Check = n => Number.isInteger(n) && n >= 1;
const inRange = (lo: number, hi: number): Check => n => Number.isInteger(n) && n >= lo && n <= hi;

// Reads optional numeric fields; the first bad one returns its message.
const readFields = (form: Form, fields: [string, Check, string][]): Record<string, number | undefined> | string => {
    const out: Record<string, number | undefined> = {};
    for (const [key, ok, message] of fields) {
        const n = num(form[key]);
        if (n === null || (n !== undefined && !ok(n))) return message;
        out[key] = n;
    }
    return out;
};

export const parseTeenPatti = (form: Form): TeenPattiSettings | string => {
    const r = readFields(form, [
        ['defaultBoot', positive, 'Table rules must be positive numbers.'],
        ['potLimit', positive, 'Table rules must be positive numbers.'],
        ['maxBlindTurns', positive, 'Table rules must be positive numbers.'],
        ['maxChaal', positive, 'Table rules must be positive numbers.'],
        ['turnTimer', inRange(5, 300), TIMER],
        ['bootRiseEvery', wholeAtLeast1, COUNT],
        ['bootRiseStep', positive, AMOUNT],
    ]);
    if (typeof r === 'string') return r;
    if (r.maxBlindTurns !== undefined && !inRange(1, 20)(r.maxBlindTurns)) return 'Max blind turns must be 1 to 20.';
    if ((r.bootRiseEvery === undefined) !== (r.bootRiseStep === undefined)) return 'Boot rise needs both the rounds and the amount.';
    return r;
};

export const parsePoker = (form: Form): PokerSettings | string => {
    const sb = num(form.smallBlindAmount);
    const bb = num(form.bigBlindAmount);
    if (sb === null || bb === null || sb === undefined || bb === undefined || sb <= 0 || bb <= 0) return 'Blinds must be positive numbers.';
    if (bb < sb) return 'Big blind must be at least the small blind.';
    const r = readFields(form, [
        ['levelMinutes', inRange(1, 240), 'Blind level must be 1 to 240 minutes.'],
        ['ante', positive, AMOUNT],
        ['turnTimer', inRange(5, 300), TIMER],
        ['maxRebuys', wholeAtLeast1, COUNT],
        ['rebuyUntilLevel', wholeAtLeast1, COUNT],
        ['addOnAmount', positive, AMOUNT],
        ['minBuyIn', positive, AMOUNT],
        ['maxBuyIn', positive, AMOUNT],
        ['bombEvery', wholeAtLeast1, COUNT],
        ['bombAmount', positive, AMOUNT],
    ]);
    if (typeof r === 'string') return r;
    if (r.minBuyIn !== undefined && r.maxBuyIn !== undefined && r.minBuyIn > r.maxBuyIn) return "Min buy-in can't be more than max buy-in.";
    if ((r.bombEvery === undefined) !== (r.bombAmount === undefined)) return 'Bomb pot needs both the hands and the amount.';
    return { ...r, smallBlindAmount: sb, bigBlindAmount: bb, straddle: form.straddle === 'on' };
};

export const parseBlackjack = (form: Form): BlackjackSettings | string => {
    const minBet = num(form.minBet);
    const maxBet = num(form.maxBet);
    if (minBet === null || maxBet === null || minBet === undefined || maxBet === undefined || minBet <= 0 || minBet > maxBet) {
        return 'Min bet must be positive and no more than max bet.';
    }
    const hands = num(form.defaultHands);
    if (hands === null || hands === undefined || !inRange(1, 5)(hands)) return 'Hands per player must be 1 to 5.';
    const r = readFields(form, [['bankerEvery', wholeAtLeast1, COUNT]]);
    if (typeof r === 'string') return r;
    return {
        blackjackPayout: form.blackjackPayout === '6to5' ? '6to5' : '3to2',
        allowSurrender: form.allowSurrender === 'on',
        minBet,
        maxBet,
        insurance: form.insurance === 'on',
        defaultHands: hands,
        bankerEvery: r.bankerEvery,
        sideBets: form.sideBets === 'on',
    };
};

// One log item per setting (some cover two fields); null text means off.
type Item<S> = { keys: (keyof S)[]; off: string; text: (s: S) => string | null };
const money = (n: number) => `₹${formatAmount(n)}`;
const onOff = (label: string, value: boolean | undefined) => `${label} ${value ? 'on' : 'off'}`;
const opt = <S,>(key: keyof S, off: string, text: (v: number) => string): Item<S> =>
    ({ keys: [key], off, text: s => (s[key] === undefined ? null : text(s[key] as number)) });

const TEEN_PATTI_ITEMS: Item<TeenPattiSettings>[] = [
    opt('defaultBoot', 'boot', v => `boot ${money(v)}`),
    opt('potLimit', 'pot limit', v => `pot limit ${money(v)}`),
    opt('maxBlindTurns', 'max blind turns', v => `max blind turns ${v}`),
    opt('maxChaal', 'max chaal', v => `max chaal ${money(v)}`),
    opt('turnTimer', 'turn timer', v => `turn timer ${v} s`),
    { keys: ['bootRiseEvery', 'bootRiseStep'], off: 'boot rise', text: s => (s.bootRiseEvery && s.bootRiseStep ? `boot rise ${money(s.bootRiseStep)} every ${s.bootRiseEvery} rounds` : null) },
];

const POKER_ITEMS: Item<PokerSettings>[] = [
    { keys: ['smallBlindAmount', 'bigBlindAmount'], off: 'blinds', text: s => `blinds ${money(s.smallBlindAmount)}/${money(s.bigBlindAmount)}` },
    opt('levelMinutes', 'blind level', v => `blind level ${v} min`),
    opt('ante', 'ante', v => `ante ${money(v)}`),
    { keys: ['straddle'], off: 'straddle', text: s => onOff('straddle', s.straddle) },
    opt('turnTimer', 'turn timer', v => `turn timer ${v} s`),
    opt('maxRebuys', 'max rebuys', v => `max rebuys ${v}`),
    opt('rebuyUntilLevel', 'rebuys until level', v => `rebuys until level ${v}`),
    opt('addOnAmount', 'add-on', v => `add-on ${money(v)}`),
    opt('minBuyIn', 'min buy-in', v => `min buy-in ${money(v)}`),
    opt('maxBuyIn', 'max buy-in', v => `max buy-in ${money(v)}`),
    { keys: ['bombEvery', 'bombAmount'], off: 'bomb pot', text: s => (s.bombEvery && s.bombAmount ? `bomb pot ${money(s.bombAmount)} every ${s.bombEvery} hands` : null) },
];

const BLACKJACK_ITEMS: Item<BlackjackSettings>[] = [
    { keys: ['blackjackPayout'], off: 'payout', text: s => `payout ${s.blackjackPayout === '6to5' ? '6:5' : '3:2'}` },
    { keys: ['allowSurrender'], off: 'surrender', text: s => onOff('surrender', s.allowSurrender) },
    { keys: ['minBet'], off: 'min bet', text: s => `min bet ${money(s.minBet)}` },
    { keys: ['maxBet'], off: 'max bet', text: s => `max bet ${money(s.maxBet)}` },
    { keys: ['insurance'], off: 'insurance', text: s => onOff('insurance', s.insurance) },
    { keys: ['defaultHands'], off: 'hands per player', text: s => `hands per player ${s.defaultHands}` },
    opt('bankerEvery', 'banker', v => `banker every ${v} rounds`),
    { keys: ['sideBets'], off: 'side bets', text: s => onOff('side bets', s.sideBets) },
];

const changeLine = <S,>(items: Item<S>[], before: S, after: S): string | null => {
    const changed = items.filter(item => item.keys.some(k => before[k] !== after[k])).map(item => item.text(after) ?? `${item.off} off`);
    return changed.length ? `Settings: ${changed.join(', ')}` : null;
};

export const teenPattiChange = (before: TeenPattiSettings, after: TeenPattiSettings) => changeLine(TEEN_PATTI_ITEMS, before, after);
export const pokerChange = (before: PokerSettings, after: PokerSettings) => changeLine(POKER_ITEMS, before, after);
export const blackjackChange = (before: BlackjackSettings, after: BlackjackSettings) => changeLine(BLACKJACK_ITEMS, before, after);
