import { formatAmount } from '../../utils/formatters.ts';

export interface BlindClock {
    levelMinutes?: number;
    blindLevel: number;
    levelEndsAt?: number; // epoch ms
    pausedRemainingMs?: number;
    smallBlindAmount: number;
    bigBlindAmount: number;
}

const MINUTE_MS = 60_000;

export const startClock = (levelMinutes: number | undefined, now: number) =>
    levelMinutes ? { levelMinutes, blindLevel: 1, levelEndsAt: now + levelMinutes * MINUTE_MS } : { blindLevel: 1 };

// At a hand's start: at most one level up, when the clock is running and has run out.
export const tickLevel = <S extends BlindClock>(s: S, now: number): { state: S; line: string | null } => {
    if (!s.levelMinutes || s.levelEndsAt === undefined || s.pausedRemainingMs !== undefined || now < s.levelEndsAt) {
        return { state: s, line: null };
    }
    const smallBlindAmount = s.smallBlindAmount * 2;
    const bigBlindAmount = s.bigBlindAmount * 2;
    const blindLevel = s.blindLevel + 1;
    return {
        state: { ...s, smallBlindAmount, bigBlindAmount, blindLevel, levelEndsAt: now + s.levelMinutes * MINUTE_MS },
        line: `Blinds up: level ${blindLevel}, ₹${formatAmount(smallBlindAmount)}/₹${formatAmount(bigBlindAmount)}.`,
    };
};

export const pauseClock = <S extends BlindClock>(s: S, now: number): S =>
    ({ ...s, pausedRemainingMs: Math.max(0, (s.levelEndsAt ?? now) - now) });

export const resumeClock = <S extends BlindClock>(s: S, now: number): S =>
    ({ ...s, levelEndsAt: now + (s.pausedRemainingMs ?? 0), pausedRemainingMs: undefined });

const mmss = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

// Null when blind levels are off.
export const clockLabel = (s: BlindClock, now: number): string | null => {
    if (!s.levelMinutes || s.levelEndsAt === undefined) return null;
    if (s.pausedRemainingMs !== undefined) return `Paused · ${mmss(s.pausedRemainingMs)}`;
    if (now >= s.levelEndsAt) return 'Blinds go up next hand';
    return `Level ${s.blindLevel} · ₹${formatAmount(s.smallBlindAmount)}/₹${formatAmount(s.bigBlindAmount)} · ${mmss(s.levelEndsAt - now)}`;
};
