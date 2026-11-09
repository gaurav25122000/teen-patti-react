import { couldNot } from './formatters.ts';

// Players remembered on this device only, keyed by phone.
export interface SavedPlayer {
    name: string;
    phone: string;
    upi?: string;
}

const SAVED_PLAYERS_KEY = 'bets-saved-players';
const MAX_SAVED_PLAYERS = 200;
const SAVED_PLAYERS_FULL = `You can save up to ${MAX_SAVED_PLAYERS} players.`;

const PHONE_PATTERN = /^\d{10}$/;
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

const isSavedPlayer = (value: unknown): value is SavedPlayer => {
    const p = value as SavedPlayer;
    return typeof p === 'object' && p !== null && typeof p.name === 'string' && p.name.trim() !== '' && typeof p.phone === 'string'
        && PHONE_PATTERN.test(p.phone) && (p.upi === undefined || (typeof p.upi === 'string' && UPI_PATTERN.test(p.upi)));
};

export const readSavedPlayers = (storage: Pick<Storage, 'getItem'> = localStorage): SavedPlayer[] => {
    try {
        const parsed = JSON.parse(storage.getItem(SAVED_PLAYERS_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        const phones = new Set<string>();
        return parsed.filter(isSavedPlayer).filter(p => {
            if (phones.has(p.phone)) return false; // the first entry per phone wins
            phones.add(p.phone);
            return true;
        });
    } catch {
        return [];
    }
};

export const writeSavedPlayers = (list: SavedPlayer[], storage: Pick<Storage, 'setItem'> = localStorage) => {
    storage.setItem(SAVED_PLAYERS_KEY, JSON.stringify(list));
};

// Game players upserted by phone: the latest trimmed name wins, an existing UPI ID stays.
export const upsertPlayers = (list: SavedPlayer[], players: { name: string; phone?: string }[]) => {
    const next = [...list];
    let refused = 0;
    for (const p of players) {
        const name = p.name.trim();
        if (!name || !p.phone || !PHONE_PATTERN.test(p.phone)) continue;
        const index = next.findIndex(s => s.phone === p.phone);
        if (index >= 0) next[index] = { ...next[index], name };
        else if (next.length >= MAX_SAVED_PLAYERS) refused++;
        else next.push({ name, phone: p.phone });
    }
    return { list: next, refused };
};

// Saves game players to the device; returns the message when the list is full or the save fails.
export const rememberPlayers = (players: { name: string; phone?: string }[]): string | null => {
    if (players.length === 0) return null;
    try {
        const { list, refused } = upsertPlayers(readSavedPlayers(), players);
        writeSavedPlayers(list);
        return refused > 0 ? SAVED_PLAYERS_FULL : null;
    } catch (error) {
        console.error('Could not save players:', error);
        return couldNot('save', error);
    }
};

// Adds (originalPhone undefined) or edits one entry from the Saved Players screen; returns the new list or an error.
export const saveEntry = (
    list: SavedPlayer[],
    entry: { name: string; phone: string; upi: string },
    originalPhone?: string
): SavedPlayer[] | string => {
    const name = entry.name.trim();
    const phone = entry.phone.trim();
    const upi = entry.upi.trim();
    if (!name) return 'Enter a name.';
    if (!PHONE_PATTERN.test(phone)) return 'Phone must be 10 digits.';
    if (upi && !UPI_PATTERN.test(upi)) return 'Enter a valid UPI ID.';
    if (list.some(s => s.phone === phone && s.phone !== originalPhone)) return 'Another saved player has this phone.';
    const saved: SavedPlayer = upi ? { name, phone, upi } : { name, phone };
    if (originalPhone === undefined) {
        return list.length >= MAX_SAVED_PLAYERS ? SAVED_PLAYERS_FULL : [...list, saved];
    }
    return list.map(s => (s.phone === originalPhone ? saved : s));
};

// Chip tap: fills the first row whose name and phone are empty, else adds a row; other fields are left alone.
export const fillRow = <R extends { name: string; phoneNumber: string }>(rows: R[], picked: SavedPlayer, blankRow: R): R[] => {
    const filled = { name: picked.name, phoneNumber: picked.phone };
    const index = rows.findIndex(r => !r.name.trim() && !r.phoneNumber.trim());
    return index === -1 ? [...rows, { ...blankRow, ...filled }] : rows.map((r, i) => (i === index ? { ...r, ...filled } : r));
};
