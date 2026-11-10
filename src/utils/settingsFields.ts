import type { Form } from './gameSettings.ts';

// What the settings form shows for each game; amounts take decimals.
export interface FieldSpec {
    key: string;
    label: string;
    kind?: 'amount' | 'count' | 'toggle' | 'choice' | 'text';
    options?: [string, string][];
    only?: 'cash' | 'tournament'; // poker mode the field belongs to
    placeholder?: string;
}

export const TEEN_PATTI_FIELDS: FieldSpec[] = [
    { key: 'defaultBoot', label: 'Default boot (₹)' },
    { key: 'potLimit', label: 'Pot limit (₹)' },
    { key: 'maxBlindTurns', label: 'Max blind turns (1-20)', kind: 'count' },
    { key: 'maxChaal', label: 'Max chaal (₹)' },
    { key: 'turnTimer', label: 'Turn timer (5-300 s)', kind: 'count' },
    { key: 'bootRiseEvery', label: 'Boot rise every N rounds', kind: 'count' },
    { key: 'bootRiseStep', label: 'Boot rise by (₹)' },
];

export const POKER_FIELDS: FieldSpec[] = [
    { key: 'smallBlindAmount', label: 'Small blind (₹)' },
    { key: 'bigBlindAmount', label: 'Big blind (₹)' },
    { key: 'levelMinutes', label: 'Blind level (minutes)', kind: 'count' },
    { key: 'ante', label: 'Ante (₹)' },
    { key: 'straddle', label: 'Straddle', kind: 'toggle' },
    { key: 'turnTimer', label: 'Turn timer (5-300 s)', kind: 'count' },
    { key: 'maxRebuys', label: 'Max rebuys', kind: 'count' },
    { key: 'rebuyUntilLevel', label: 'Rebuys until level', kind: 'count' },
    { key: 'addOnAmount', label: 'Add-on (₹)', only: 'cash' },
    { key: 'minBuyIn', label: 'Min buy-in (₹)', only: 'cash' },
    { key: 'maxBuyIn', label: 'Max buy-in (₹)', only: 'cash' },
    { key: 'bombEvery', label: 'Bomb pot every N hands', kind: 'count' },
    { key: 'bombAmount', label: 'Bomb pot (₹)' },
    { key: 'buyIn', label: 'Buy-in (₹)', only: 'tournament' },
    { key: 'startingChips', label: 'Starting chips', only: 'tournament' },
    { key: 'addOnPrice', label: 'Add-on price (₹)', only: 'tournament' },
    { key: 'addOnChips', label: 'Add-on chips', only: 'tournament' },
    { key: 'payouts', label: 'Payouts (%)', kind: 'text', only: 'tournament', placeholder: 'By entrants, e.g. 50, 30, 20' },
];

export const pokerFields = (tournament: boolean) => POKER_FIELDS.filter(f => !f.only || f.only === (tournament ? 'tournament' : 'cash'));

export const BLACKJACK_FIELDS: FieldSpec[] = [
    { key: 'blackjackPayout', label: 'Blackjack pays', kind: 'choice', options: [['3to2', '3:2'], ['6to5', '6:5']] },
    { key: 'allowSurrender', label: 'Surrender', kind: 'toggle' },
    { key: 'minBet', label: 'Min bet (₹)' },
    { key: 'maxBet', label: 'Max bet (₹)' },
    { key: 'insurance', label: 'Insurance', kind: 'toggle' },
    { key: 'defaultHands', label: 'Hands per player (1-5)', kind: 'count' },
    { key: 'bankerEvery', label: 'Banker every N rounds', kind: 'count' },
    { key: 'sideBets', label: 'Side bets', kind: 'toggle' },
];

// Settings to form text: numbers as text (blank when off), switches as 'on' or ''.
export const toForm = (settings: object): Form =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'on' : '') : v === undefined || v === null ? '' : String(v)]));
