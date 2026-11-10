import { partialStats, summaryLines, type GameKind, type NightStats, type PlayerNet } from './nightStats.ts';
import { couldNot } from './formatters.ts';
import type { Person, Transaction } from './owingsLogic.ts';
import { playerNets } from './gameSettlement.ts';
import { shareText } from './settlement.ts';
import type { SavedPlayer } from './savedPlayers.ts';

interface SettlementParts {
    people: Person[]; // the house included
    transactions: Transaction[];
    carried: boolean | undefined; // someone started or joined with a balance (undefined: an older save can't tell)
    offBy?: number; // nets that no transfer covers; the summary says so
}

export interface HistoryEntry {
    id: string;
    endedAt: string;
    game: GameKind;
    nets: PlayerNet[];
    transactions: (Transaction & { paid: boolean })[];
    summary: string[];
    updatedAt?: number; // epoch ms of the last change, for sync
    deleted?: boolean; // a tombstone: hidden, but kept so sync can't bring the entry back
}

export const liveHistory = (list: HistoryEntry[]) => list.filter(e => !e.deleted);

export const HISTORY_KEY = 'bets-history';
const UNREADABLE_PREFIX = 'bets-history-unreadable-';
export const MAX_HISTORY = 50;
const MAX_WITH_UNPAID = 200;

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const GAMES: GameKind[] = ['teen-patti', 'poker', 'blackjack'];

const isNet = (n: PlayerNet | null) => typeof n?.name === 'string' && typeof n.net === 'number';
const isTransfer = (t: HistoryEntry['transactions'][number] | null) =>
    typeof t?.from === 'string' && typeof t.to === 'string' && typeof t.amount === 'number' && typeof t.paid === 'boolean'
    && (t.toPhone === null || typeof t.toPhone === 'string');

export const isEntry = (value: unknown): value is HistoryEntry => {
    const e = value as HistoryEntry;
    return typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.endedAt === 'string'
        && GAMES.includes(e.game) && Array.isArray(e.nets) && e.nets.every(isNet)
        && Array.isArray(e.transactions) && e.transactions.every(isTransfer)
        && Array.isArray(e.summary) && e.summary.every(line => typeof line === 'string')
        && (e.updatedAt === undefined || Number.isFinite(e.updatedAt)) && (e.deleted === undefined || typeof e.deleted === 'boolean');
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

// Newest first: the newest 50 live games, plus older ones that still have an unpaid transfer, up to 200 in all.
// Tombstones don't count and are kept until sync prunes them.
export const capHistory = (list: HistoryEntry[]) => {
    const live = liveHistory(list);
    const kept = [...live.slice(0, MAX_HISTORY), ...live.slice(MAX_HISTORY).filter(e => e.transactions.some(t => !t.paid))].slice(0, MAX_WITH_UNPAID);
    return [...kept, ...list.filter(e => e.deleted)];
};

export const addEntry = (list: HistoryEntry[], entry: HistoryEntry) => capHistory([entry, ...list]);

export const buildEntry = (game: GameKind, stats: NightStats, s: SettlementParts, now = new Date()): HistoryEntry => ({
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    endedAt: now.toISOString(),
    game,
    nets: playerNets(s.people),
    transactions: s.transactions.map(t => ({ ...t, paid: false })),
    summary: summaryLines(stats, s.people, game, s.carried, s.offBy),
    updatedAt: now.getTime(),
});

const moved = (net: number) => Math.abs(net) >= 0.005;

// Saves a game being replaced or ended if it had a round or moved money (the house included).
// A failed save returns its message and the entry, so the settlement can still be copied.
export const archiveGame = (
    game: GameKind,
    stats: NightStats | undefined,
    s: SettlementParts,
    storage: HistoryStorage = localStorage
): { message: string; entry: HistoryEntry } | null => {
    const known = stats ?? partialStats();
    if (known.rounds < 1 && !s.people.some(p => moved(p.net))) return null;
    const entry = buildEntry(game, known, s);
    try {
        writeHistory(addEntry(readHistory(storage), entry), storage);
        return null;
    } catch (error) {
        console.error('Could not save game history:', error);
        return { message: couldNot('save', error), entry };
    }
};

// Re-share sends only what is still owed; with everything paid it reads "All settled up".
export const historyShareText = (e: HistoryEntry, saved: SavedPlayer[]) =>
    shareText(e.transactions.filter(t => !t.paid), e.summary, saved);

export const setPaid = (list: HistoryEntry[], id: string, index: number, paid: boolean, now = Date.now()) =>
    list.map(e => (e.id !== id ? e : { ...e, transactions: e.transactions.map((t, i) => (i === index ? { ...t, paid } : t)), updatedAt: now }));

// A delete leaves a tombstone so sync can't bring the entry back.
export const deleteHistoryEntry = (list: HistoryEntry[], id: string, now = Date.now()) =>
    list.map(e => (e.id === id ? { ...e, deleted: true, updatedAt: now } : e));
