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

// What survives a round reset besides what endRound sets itself: groups, departures, settings, counters.
export const roundCarryOver = (prev: GameState) => ({
    entities: prev.entities,
    departed: prev.departed,
    carriedIn: prev.carriedIn,
    potLimit: prev.potLimit,
    maxBlindTurns: prev.maxBlindTurns,
    maxChaal: prev.maxChaal,
    defaultBoot: prev.defaultBoot,
    turnTimer: prev.turnTimer,
    bootRiseEvery: prev.bootRiseEvery,
    bootRiseStep: prev.bootRiseStep,
    roundsStarted: prev.roundsStarted,
    startedAt: prev.startedAt,
});

// The boot for the next round: every N rounds since setup it rises by the step (at round N+1, 2N+1, …).
export const nextBoot = (s: Pick<GameState, 'bootRiseEvery' | 'bootRiseStep' | 'roundsStarted'>, boot: number) => {
    const played = s.roundsStarted ?? 0;
    return s.bootRiseEvery && s.bootRiseStep && played > 0 && played % s.bootRiseEvery === 0 ? boot + s.bootRiseStep : boot;
};

// Who the D badge sits on: this round's dealer, or between rounds the next one (the last winner, else the first player).
export const dealerOf = (s: Pick<GameState, 'roundActive' | 'dealerId' | 'lastWinnerId' | 'players'>) =>
    s.roundActive ? s.dealerId : (s.players.some(p => p.id === s.lastWinnerId) ? s.lastWinnerId ?? undefined : s.players[0]?.id);

export const bootRefusal = (rules: TableRules, boot: number) =>
    rules.maxChaal !== undefined && boot > rules.maxChaal / 2
        ? `Boot is above the max blind bet (₹${formatAmount(rules.maxChaal / 2)}).`
        : null;

// Log line for a bet that takes the pot to the limit; the bet itself is accepted in full.
export const potLimitLines = (potLimit: number | undefined, pot: number) =>
    potLimit !== undefined && pot >= potLimit ? [potLimitLine(potLimit)] : [];
