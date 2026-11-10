// Per-player results across History entries, by the name each entry shows. Sums are kept in whole paise.
import type { HistoryEntry } from './history.ts';
import { paise } from './money.ts';

export interface PlayerStat {
    name: string;
    games: number;
    won: number; // games with net above half a paisa
    total: number;
    best: number;
    worst: number;
    average: number;
    trend: { endedAt: string; total: number }[]; // cumulative net, oldest game first
}

const byTime = (entries: HistoryEntry[]) => entries.filter(e => !e.deleted).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));

export const playerStats = (entries: HistoryEntry[]): PlayerStat[] => {
    const stats = new Map<string, PlayerStat & { cents: number }>();
    for (const e of byTime(entries)) {
        for (const { name, net } of e.nets) {
            const s = stats.get(name) ?? stats.set(name, { name, games: 0, won: 0, total: 0, best: net, worst: net, average: 0, trend: [], cents: 0 }).get(name)!;
            s.games++;
            if (net > 0.005) s.won++;
            s.cents += paise(net);
            s.best = Math.max(s.best, net);
            s.worst = Math.min(s.worst, net);
            s.trend.push({ endedAt: e.endedAt, total: s.cents / 100 });
        }
    }
    return [...stats.values()]
        .map(({ cents, ...s }) => ({ ...s, total: cents / 100, average: paise(cents / 100 / s.games) / 100 }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

// The games two players both played, and each one's total in them.
export const headToHead = (entries: HistoryEntry[], a: string, b: string) => {
    const both = byTime(entries).filter(e => e.nets.some(n => n.name === a) && e.nets.some(n => n.name === b));
    const total = (name: string) => both.reduce((sum, e) => sum + e.nets.filter(n => n.name === name).reduce((s, n) => s + paise(n.net), 0), 0) / 100;
    return { games: both.length, a: total(a), b: total(b) };
};
