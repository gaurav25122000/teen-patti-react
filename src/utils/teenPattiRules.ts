import { formatAmount } from './formatters.ts';
import type { GameState } from '../types/gameTypes.ts';

// Optional table rules; absent means no rule.
export interface TableRules {
    potLimit?: number;
    maxBlindTurns?: number;
    maxChaal?: number;
}

interface RoundState extends TableRules {
    potAmount: number;
    roundActive: boolean;
}

export const potLimitReached = (s: RoundState) => s.roundActive && s.potLimit !== undefined && s.potAmount >= s.potLimit;

const potLimitLine = (potLimit: number) => `Pot limit ₹${formatAmount(potLimit)} reached. Everyone still in shows; pick the winner.`;

export const blindTurnsRefusal = (rules: TableRules, name: string, turns: number) =>
    rules.maxBlindTurns !== undefined && turns >= rules.maxBlindTurns
        ? `${name} has played ${rules.maxBlindTurns} blind turns and must see.`
        : null;

// Why a blind, chaal or show bet is refused, or null when it is allowed. isBlind: the bettor has not seen.
export const betRefusal = (s: RoundState, kind: 'blind' | 'chaal' | 'show', amount: number, name: string, blindTurns: number, isBlind: boolean) => {
    if (potLimitReached(s)) return potLimitLine(s.potLimit!);
    if (isBlind && kind !== 'chaal') {
        const turns = blindTurnsRefusal(s, name, blindTurns);
        if (turns) return turns;
    }
    if (kind === 'blind' && s.maxChaal !== undefined && amount > s.maxChaal / 2) return `Max blind bet is ₹${formatAmount(s.maxChaal / 2)}.`;
    if (kind === 'chaal' && s.maxChaal !== undefined && amount > s.maxChaal) return `Max chaal is ₹${formatAmount(s.maxChaal)}.`;
    return null;
};

// Entities and table rules survive a round reset; endRound sets players, winner, boot, stats and log itself.
export const roundCarryOver = (prev: Pick<GameState, 'entities' | 'potLimit' | 'maxBlindTurns' | 'maxChaal'>) => ({
    entities: prev.entities,
    potLimit: prev.potLimit,
    maxBlindTurns: prev.maxBlindTurns,
    maxChaal: prev.maxChaal,
});

export const bootRefusal = (rules: TableRules, boot: number) =>
    rules.maxChaal !== undefined && boot > rules.maxChaal / 2
        ? `Boot is above the max blind bet (₹${formatAmount(rules.maxChaal / 2)}).`
        : null;

export const tableRulesLine = (rules: TableRules) => `Table rules: ${[
    rules.potLimit !== undefined ? `pot limit ₹${formatAmount(rules.potLimit)}` : 'no pot limit',
    rules.maxBlindTurns !== undefined ? `max ${rules.maxBlindTurns} blind turns` : 'no blind limit',
    rules.maxChaal !== undefined ? `max chaal ₹${formatAmount(rules.maxChaal)}` : 'no max chaal',
].join(', ')}`;

// Form text to rules: empty is off; returns an error message for a bad value.
export const parseTableRules = (input: { potLimit: string; maxBlindTurns: string; maxChaal: string }): TableRules | string => {
    const rules: TableRules = {};
    for (const key of ['potLimit', 'maxBlindTurns', 'maxChaal'] as const) {
        const text = input[key].trim();
        if (!text) continue;
        const value = Number(text);
        if (!Number.isFinite(value) || value <= 0) return 'Table rules must be positive numbers.';
        if (key === 'maxBlindTurns' && (!Number.isInteger(value) || value > 20)) return 'Max blind turns must be 1 to 20.';
        rules[key] = value;
    }
    return rules;
};

// Log line for a bet that takes the pot to the limit; the bet itself is accepted in full.
export const potLimitLines = (potLimit: number | undefined, pot: number) =>
    potLimit !== undefined && pot >= potLimit ? [potLimitLine(potLimit)] : [];
