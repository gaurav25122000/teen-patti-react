// One sync of saved players and history with the group: pull, decrypt, merge, push (retrying on 409).
import { decryptBlob, encryptBlob, groupIdOf } from './syncCrypto.ts';
import { canonical, historyFromWire, mergeHistory, mergePlayers, playerFromWire, playerToWire } from './syncMerge.ts';
import { loadAllSavedPlayers, writeSavedPlayers, type SavedPlayer } from '../utils/savedPlayers.ts';
import { readHistory, writeHistory, type HistoryEntry } from '../utils/history.ts';

type Kind = 'players' | 'history';
type Remote = { blob: string | null; version: number } | null;

export interface SyncDeps {
    post: (fn: 'syncGet' | 'syncPut', body: object) => Promise<{ status: number; body: unknown }>;
    storage: Storage;
    now: () => number;
}

export class SyncError extends Error {}

const DAMAGED = 'Sync failed: wrong group key or damaged data.';
const RETRIES = 3;

// The status line for a failed sync.
export const failureText = (error: unknown) =>
    error instanceof SyncError ? (error.message === DAMAGED ? DAMAGED : `Sync failed: ${error.message}`) : "Sync failed: couldn't reach the server";

const checked = async (deps: SyncDeps, fn: 'syncGet' | 'syncPut', body: object) => {
    let res;
    try {
        res = await deps.post(fn, body);
    } catch {
        throw new SyncError("couldn't reach the server");
    }
    if (res.status === 503) throw new SyncError("sync isn't set up on the server yet");
    if (res.status !== 200 && res.status !== 409) throw new SyncError(`server error ${res.status}`);
    return res;
};

const decode = async (key: Uint8Array, remote: Remote): Promise<unknown[]> => {
    if (!remote?.blob) return [];
    try {
        const parsed = JSON.parse(await decryptBlob(key, remote.blob));
        if (parsed?.v !== 1 || !Array.isArray(parsed.items)) throw new Error('not a sync document');
        return parsed.items;
    } catch {
        throw new SyncError(DAMAGED);
    }
};

const kinds = {
    players: {
        read: (s: Storage) => {
            const { list, failed } = loadAllSavedPlayers(s);
            if (failed) throw new SyncError("saved players can't be read");
            return list;
        },
        fromWire: (items: unknown[]) => items.map(i => playerFromWire(i as ReturnType<typeof playerToWire>)).filter((p): p is SavedPlayer => p !== null),
        merge: mergePlayers,
        toWire: (list: SavedPlayer[]) => list.map(playerToWire),
        write: (list: SavedPlayer[], s: Storage) => writeSavedPlayers(list, s),
    },
    history: {
        read: (s: Storage) => readHistory(s),
        fromWire: historyFromWire,
        merge: mergeHistory,
        toWire: (list: HistoryEntry[]) => list,
        write: (list: HistoryEntry[], s: Storage) => writeHistory(list, s),
    },
};

const syncKind = async (key: Uint8Array, groupId: string, kind: Kind, remote: Remote, deps: SyncDeps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the two kinds share one flow
    const k = kinds[kind] as any;
    let local = k.read(deps.storage);
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
        const remoteItems = k.fromWire(await decode(key, remote));
        const merged = k.merge(local, remoteItems, deps.now());
        if (canonical(merged) !== canonical(local)) k.write(merged, deps.storage);
        local = merged;
        if (canonical(k.toWire(merged)) === canonical(k.toWire(remoteItems))) return;
        const blob = await encryptBlob(key, JSON.stringify({ v: 1, items: k.toWire(merged) }));
        const res = await checked(deps, 'syncPut', { groupId, kind, blob, baseVersion: remote?.version ?? 0 });
        if (res.status === 200) return;
        remote = res.body as Remote; // someone else wrote first: merge with theirs and try again
    }
    throw new SyncError('too many changes at once, try again');
};

export const syncOnce = async (key: Uint8Array, deps: SyncDeps) => {
    const groupId = await groupIdOf(key);
    const { body } = await checked(deps, 'syncGet', { groupId });
    const remote = body as { players: Remote; history: Remote };
    await syncKind(key, groupId, 'players', remote.players, deps);
    await syncKind(key, groupId, 'history', remote.history, deps);
};

// "9:45 pm": hours without a leading zero, lowercase am/pm.
export const syncedAt = (ms: number) => {
    const d = new Date(ms);
    const h = d.getHours();
    return `Synced ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
