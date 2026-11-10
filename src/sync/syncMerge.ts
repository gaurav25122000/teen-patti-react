// Pure sync merging, shared logic with the Android app: same winners on every device.
import { avatarColor, isSavedPlayer, type SavedPlayer } from '../utils/savedPlayers.ts';
import { capHistory, isEntry, type HistoryEntry } from '../utils/history.ts';

const TOMBSTONE_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface Stamped {
    updatedAt?: number;
    deleted?: boolean;
}

// JSON with sorted keys and no spaces: a tie-break every device computes the same way.
export const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
            .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

// Newer wins; on a tie a tombstone wins, then the greater canonical JSON.
const winner = <T extends Stamped>(a: T, b: T): T => {
    const ua = a.updatedAt ?? 0;
    const ub = b.updatedAt ?? 0;
    if (ua !== ub) return ua > ub ? a : b;
    if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
    return canonical(a) >= canonical(b) ? a : b;
};

export const mergeItems = <T extends Stamped>(local: T[], remote: T[], keyOf: (item: T) => string): T[] => {
    const byKey = new Map<string, T>();
    for (const item of [...local, ...remote]) {
        const key = keyOf(item);
        const current = byKey.get(key);
        byKey.set(key, current ? winner(current, item) : item);
    }
    return [...byKey.values()];
};

export const pruneTombstones = <T extends Stamped>(items: T[], now: number) =>
    items.filter(item => !item.deleted || now - (item.updatedAt ?? 0) < TOMBSTONE_DAYS_MS);

// The wire shape of a saved player (null where absent).
export const playerToWire = (p: SavedPlayer) => ({
    phone: p.phone, name: p.name, upi: p.upi ?? null, color: avatarColor(p), emoji: p.emoji ?? null,
    updatedAt: p.updatedAt ?? 0, deleted: !!p.deleted,
});

type WirePlayer = ReturnType<typeof playerToWire>;

// A wire item back to a saved player, or null when it isn't one.
export const playerFromWire = (w: WirePlayer): SavedPlayer | null => {
    const p: SavedPlayer = { name: w?.name, phone: w?.phone, updatedAt: w?.updatedAt, ...(w?.deleted ? { deleted: true } : {}) };
    if (w?.upi) p.upi = w.upi;
    if (w?.emoji) p.emoji = w.emoji;
    if (w?.color !== undefined && w?.color !== null) p.color = w.color;
    return isSavedPlayer(p) ? p : null;
};

export const mergePlayers = (local: SavedPlayer[], remote: SavedPlayer[], now: number) =>
    pruneTombstones(mergeItems(local, remote, p => p.phone), now);

// History merges by id, newest game first, then keeps the live cap.
export const mergeHistory = (local: HistoryEntry[], remote: HistoryEntry[], now: number) =>
    capHistory(pruneTombstones(mergeItems(local, remote, e => e.id), now).sort((a, b) => b.endedAt.localeCompare(a.endedAt)));

export const historyFromWire = (items: unknown[]) => items.filter(isEntry);
