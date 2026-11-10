import { couldNot, toTitleCase } from './formatters.ts';

// Players remembered on this device (and synced to a group, if any), keyed by phone.
export interface SavedPlayer {
    name: string;
    phone: string;
    upi?: string;
    color?: number; // 0-11 into AVATAR_COLORS; absent means the default from the phone
    emoji?: string; // shown instead of initials
    updatedAt?: number; // epoch ms of the last change, for sync
    deleted?: boolean; // a tombstone: hidden, but kept so sync can't bring the player back
}

export const AVATAR_COLORS = ['#00C6FF', '#FF416C', '#00F260', '#FDC830', '#B388FF', '#FF9100', '#18FFFF', '#FF80AB', '#69F0AE', '#FFD740', '#8C9EFF', '#FF6E40'];

// The player's colour index: their own, else the sum of the phone's digits mod 12.
export const avatarColor = (p: { phone: string; color?: number }) =>
    p.color ?? [...p.phone].reduce((sum, d) => sum + (Number(d) || 0), 0) % AVATAR_COLORS.length;

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');

// Intl.Segmenter is newer than this project's ES2020 type library.
type GraphemeSegmenter = new (locale: undefined, options: { granularity: 'grapheme' }) => { segment: (text: string) => Iterable<unknown> };

// One emoji (a single grapheme that is a pictograph).
export const isOneEmoji = (text: string) => {
    const Segmenter = (Intl as unknown as { Segmenter: GraphemeSegmenter }).Segmenter;
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1 && /\p{Extended_Pictographic}/u.test(text);
};

export const livePlayers = (list: SavedPlayer[]) => list.filter(p => !p.deleted);

const SAVED_PLAYERS_KEY = 'bets-saved-players';
const MAX_SAVED_PLAYERS = 200;
const SAVED_PLAYERS_FULL = `You can save up to ${MAX_SAVED_PLAYERS} players.`;

const PHONE_PATTERN = /^\d{10}$/;
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

export const isSavedPlayer = (value: unknown): value is SavedPlayer => {
    const p = value as SavedPlayer;
    return typeof p === 'object' && p !== null && typeof p.name === 'string' && p.name.trim() !== '' && typeof p.phone === 'string'
        && PHONE_PATTERN.test(p.phone) && (p.upi === undefined || (typeof p.upi === 'string' && UPI_PATTERN.test(p.upi)))
        && (p.color === undefined || (Number.isInteger(p.color) && p.color >= 0 && p.color < AVATAR_COLORS.length))
        && (p.emoji === undefined || (typeof p.emoji === 'string' && p.emoji.length <= 16))
        && (p.updatedAt === undefined || Number.isFinite(p.updatedAt))
        && (p.deleted === undefined || typeof p.deleted === 'boolean');
};

// Every entry, tombstones included (sync needs them). failed: the stored list could not be read.
export const loadAllSavedPlayers = (storage: Pick<Storage, 'getItem'> = localStorage): { list: SavedPlayer[]; failed: boolean } => {
    try {
        const parsed = JSON.parse(storage.getItem(SAVED_PLAYERS_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return { list: [], failed: true };
        const phones = new Set<string>();
        return {
            list: parsed.filter(isSavedPlayer).filter(p => {
                if (phones.has(p.phone)) return false; // the first entry per phone wins
                phones.add(p.phone);
                return true;
            }),
            failed: false,
        };
    } catch {
        return { list: [], failed: true };
    }
};

// The live players; failed lets callers say so instead of showing nobody.
export const loadSavedPlayers = (storage: Pick<Storage, 'getItem'> = localStorage) => {
    const { list, failed } = loadAllSavedPlayers(storage);
    return { list: livePlayers(list), failed };
};

export const readSavedPlayers = (storage: Pick<Storage, 'getItem'> = localStorage) => loadSavedPlayers(storage).list;

// A stored phone, trimmed; blank counts as no phone.
export const cleanPhone = (phone: unknown) => (typeof phone === 'string' && phone.trim() ? phone.trim() : undefined);

export const writeSavedPlayers = (list: SavedPlayer[], storage: Pick<Storage, 'setItem'> = localStorage) => {
    storage.setItem(SAVED_PLAYERS_KEY, JSON.stringify(list));
};

// Game players upserted by phone into the full list: the latest trimmed name wins, an existing UPI ID stays,
// a deleted player comes back fresh. Only changes are stamped.
export const upsertPlayers = (list: SavedPlayer[], players: { name: string; phone?: string }[], now = Date.now()) => {
    const next = [...list];
    let refused = 0;
    for (const p of players) {
        const name = p.name.trim();
        const phone = p.phone?.trim() ?? '';
        if (!name || !PHONE_PATTERN.test(phone)) continue;
        const index = next.findIndex(s => s.phone === phone);
        const existing = next[index];
        if (existing && !existing.deleted) {
            if (existing.name !== name) next[index] = { ...existing, name, updatedAt: now };
        } else if (livePlayers(next).length >= MAX_SAVED_PLAYERS) {
            refused++;
        } else if (existing) {
            next[index] = { name, phone, updatedAt: now };
        } else {
            next.push({ name, phone, updatedAt: now });
        }
    }
    return { list: next, refused };
};

// Saves game players to the device; returns the message when the list is full or the save fails.
export const rememberPlayers = (players: { name: string; phone?: string }[]): string | null => {
    if (players.length === 0) return null;
    try {
        const { list: stored, failed } = loadAllSavedPlayers();
        if (failed) throw new Error("saved players can't be read"); // never write over a list we couldn't read
        const { list, refused } = upsertPlayers(stored, players);
        writeSavedPlayers(list);
        return refused > 0 ? SAVED_PLAYERS_FULL : null;
    } catch (error) {
        console.error('Could not save players:', error);
        return couldNot('save', error);
    }
};

// Adds (originalPhone undefined) or edits one entry from the Saved Players screen, in the full list (tombstones
// included); returns the new list or an error. A changed phone leaves a tombstone at the old one.
export const saveEntry = (
    list: SavedPlayer[],
    entry: { name: string; phone: string; upi: string; color?: number; emoji?: string },
    originalPhone?: string,
    now = Date.now()
): SavedPlayer[] | string => {
    const name = entry.name.trim();
    const phone = entry.phone.trim();
    const upi = entry.upi.trim();
    const emoji = entry.emoji?.trim() ?? '';
    if (!name) return 'Enter a name.';
    if (!PHONE_PATTERN.test(phone)) return 'Phone must be 10 digits.';
    if (upi && !UPI_PATTERN.test(upi)) return 'Enter a valid UPI ID.';
    if (emoji && !isOneEmoji(emoji)) return 'Pick one emoji.';
    const live = livePlayers(list);
    if (live.some(s => s.phone === phone && s.phone !== originalPhone)) return 'Another saved player has this phone.';
    if (originalPhone === undefined && live.length >= MAX_SAVED_PLAYERS) return SAVED_PLAYERS_FULL;
    const saved: SavedPlayer = {
        name, phone, ...(upi ? { upi } : {}), ...(entry.color !== undefined ? { color: entry.color } : {}), ...(emoji ? { emoji } : {}), updatedAt: now,
    };
    const next = originalPhone !== undefined && originalPhone !== phone ? deleteEntry(list, originalPhone, now) : [...list];
    const index = next.findIndex(s => s.phone === phone);
    if (index < 0) return [...next, saved];
    next[index] = saved;
    return next;
};

// A delete leaves a tombstone so sync can't bring the player back.
export const deleteEntry = (list: SavedPlayer[], phone: string, now = Date.now()) =>
    list.map(s => (s.phone === phone ? { ...s, deleted: true, updatedAt: now } : s));

// Chips for a setup form: saved players whose phone is not in the form yet (typed phones count once trimmed).
export const chipPlayers = (saved: SavedPlayer[], formPhones: string[]) => {
    const inForm = new Set(formPhones.map(phone => phone.trim()));
    return saved.filter(p => !inForm.has(p.phone));
};

// Chip tap: fills the first row whose name and phone are empty, else adds a row; other fields are left alone.
export const fillRow = <R extends { name: string; phoneNumber: string }>(rows: R[], picked: SavedPlayer, blankRow: R): R[] => {
    const filled = { name: picked.name, phoneNumber: picked.phone };
    const index = rows.findIndex(r => !r.name.trim() && !r.phoneNumber.trim());
    return index === -1 ? [...rows, { ...blankRow, ...filled }] : rows.map((r, i) => (i === index ? { ...r, ...filled } : r));
};

// The first phone that two setup rows share, or null.
export const duplicatePhone = (phones: string[]): string | null => {
    const seen = new Set<string>();
    for (const raw of phones) {
        const phone = raw.trim();
        if (!phone) continue;
        if (seen.has(phone)) return phone;
        seen.add(phone);
    }
    return null;
};

// Refusal for adding a phone that is already at the table, or null.
export const phoneInUse = (players: { name: string; phoneNumber?: string }[], phone: string): string | null => {
    if (!phone.trim()) return null;
    const holder = players.find(p => p.phoneNumber?.trim() === phone.trim());
    return holder ? `${phone.trim()} is already playing as ${toTitleCase(holder.name)}.` : null;
};
