import { summaryLines, type GameKind, type NightStats, type PlayerNet } from './nightStats.ts';
import { couldNot } from './formatters.ts';
import type { Transaction } from './owingsLogic.ts';

export interface HistoryEntry {
    id: string;
    endedAt: string;
    game: GameKind;
    nets: PlayerNet[];
    transactions: (Transaction & { paid: boolean })[];
    summary: string[];
}

export const HISTORY_KEY = 'bets-history';
const UNREADABLE_PREFIX = 'bets-history-unreadable-';
export const MAX_HISTORY = 50;

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const GAMES: GameKind[] = ['teen-patti', 'poker', 'blackjack'];

const isNet = (n: PlayerNet | null) => typeof n?.name === 'string' && typeof n.net === 'number';
const isTransfer = (t: HistoryEntry['transactions'][number] | null) =>
    typeof t?.from === 'string' && typeof t.to === 'string' && typeof t.amount === 'number' && typeof t.paid === 'boolean';

const isEntry = (value: unknown): value is HistoryEntry => {
    const e = value as HistoryEntry;
    return typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.endedAt === 'string'
        && GAMES.includes(e.game) && Array.isArray(e.nets) && e.nets.every(isNet)
        && Array.isArray(e.transactions) && e.transactions.every(isTransfer)
        && Array.isArray(e.summary) && e.summary.every(line => typeof line === 'string');
};

// A stored value that is not a valid history is moved to a timestamped key, never overwritten.
export const readHistory = (storage: HistoryStorage = localStorage, now = Date.now()): HistoryEntry[] => {
    const raw = storage.getItem(HISTORY_KEY);
    if (raw === null) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(isEntry)) return parsed;
    } catch { /* unreadable: kept aside below */ }
    storage.setItem(`${UNREADABLE_PREFIX}${now}`, raw); // throws when storage is full, leaving the raw value in place
    storage.removeItem(HISTORY_KEY);
    return [];
};

export const hasUnreadableHistory = (storage: HistoryStorage = localStorage) => {
    for (let i = 0; i < storage.length; i++) {
        if (storage.key(i)?.startsWith(UNREADABLE_PREFIX)) return true;
    }
    return false;
};

export const writeHistory = (list: HistoryEntry[], storage: HistoryStorage = localStorage) => {
    storage.setItem(HISTORY_KEY, JSON.stringify(list));
};

// Newest first; the oldest past the cap is dropped.
export const addEntry = (list: HistoryEntry[], entry: HistoryEntry) => [entry, ...list].slice(0, MAX_HISTORY);

export const buildEntry = (
    game: GameKind,
    stats: NightStats,
    nets: PlayerNet[],
    transactions: Transaction[],
    now = new Date()
): HistoryEntry => ({
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    endedAt: now.toISOString(),
    game,
    nets,
    transactions: transactions.map(t => ({ ...t, paid: false })),
    summary: summaryLines(stats, nets, game),
});

// Saves a game that is being replaced or ended (not one with no rounds); returns the failure message, if any.
export const archiveGame = (
    game: GameKind,
    stats: NightStats | undefined,
    nets: PlayerNet[],
    transactions: Transaction[],
    storage: HistoryStorage = localStorage
): string | null => {
    if (!stats || stats.rounds < 1) return null;
    try {
        writeHistory(addEntry(readHistory(storage), buildEntry(game, stats, nets, transactions)), storage);
        return null;
    } catch (error) {
        console.error('Could not save game history:', error);
        return couldNot('save', error);
    }
};

export const setPaid = (list: HistoryEntry[], id: string, index: number, paid: boolean) =>
    list.map(e => (e.id !== id ? e : { ...e, transactions: e.transactions.map((t, i) => (i === index ? { ...t, paid } : t)) }));
