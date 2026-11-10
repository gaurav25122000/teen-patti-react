import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeItems, mergePlayers, pruneTombstones, canonical } from './syncMerge.ts';
import { failureText, syncedAt, syncOnce, SyncError, type SyncDeps } from './syncClient.ts';
import { newGroupKey } from './syncCrypto.ts';
import { loadAllSavedPlayers, writeSavedPlayers } from '../utils/savedPlayers.ts';
import { readHistory, writeHistory, type HistoryEntry } from '../utils/history.ts';
// @ts-expect-error -- plain JS Netlify functions
import { makeSyncGet } from '../../netlify/functions/syncGet.js';
// @ts-expect-error -- plain JS Netlify functions
import { makeSyncPut } from '../../netlify/functions/syncPut.js';

const DAY = 24 * 60 * 60 * 1000;

test('merge: newer wins, a tombstone wins a tie, and ties between live items agree on every device', () => {
    const key = (x: { id: string }) => x.id;
    assert.deepEqual(mergeItems([{ id: 'a', v: 1, updatedAt: 5 }], [{ id: 'a', v: 2, updatedAt: 6 }], key), [{ id: 'a', v: 2, updatedAt: 6 }]);
    assert.deepEqual(mergeItems([{ id: 'a', v: 1, updatedAt: 6 }], [{ id: 'a', v: 2, updatedAt: 5 }], key), [{ id: 'a', v: 1, updatedAt: 6 }]);
    assert.deepEqual(mergeItems([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 5, deleted: true }], key), [{ id: 'a', updatedAt: 5, deleted: true }]);
    assert.deepEqual(mergeItems([{ id: 'a', updatedAt: 5, deleted: true }], [{ id: 'a', updatedAt: 5 }], key), [{ id: 'a', updatedAt: 5, deleted: true }]);
    const x = { id: 'a', v: 'x', updatedAt: 5 };
    const y = { id: 'a', v: 'y', updatedAt: 5 };
    assert.deepEqual(mergeItems([x], [y], key), [y]);
    assert.deepEqual(mergeItems([y], [x], key), [y]);
    assert.deepEqual(mergeItems([{ id: 'a' }], [{ id: 'b' }], key).map(i => i.id), ['a', 'b']);
});

test('canonical JSON sorts keys and leaves out undefined', () => {
    assert.equal(canonical({ b: 1, a: [true, null, 'x'], c: undefined, d: { z: 1, y: 2 } }), '{"a":[true,null,"x"],"b":1,"d":{"y":2,"z":1}}');
});

test('tombstones older than 90 days are pruned; deletes do not come back through an older copy', () => {
    const now = 100 * DAY;
    assert.deepEqual(pruneTombstones([{ id: 'old', deleted: true, updatedAt: 9 * DAY }, { id: 'new', deleted: true, updatedAt: 11 * DAY }, { id: 'live', updatedAt: 0 }], now).map(i => i.id), ['new', 'live']);
    const merged = mergePlayers([{ name: 'Asha', phone: '9000000001', deleted: true, updatedAt: 50 * DAY }], [{ name: 'Asha', phone: '9000000001', updatedAt: 40 * DAY }], now);
    assert.equal(merged[0].deleted, true);
});

// Two devices with their own storage, sharing one server built from the real functions over an in-memory table.
const memoryStorage = (): Storage => {
    const items = new Map<string, string>();
    return {
        get length() { return items.size; },
        key: (i: number) => [...items.keys()][i] ?? null,
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => { items.set(k, v); },
        removeItem: (k: string) => { items.delete(k); },
        clear: () => items.clear(),
    };
};
const server = () => {
    const rows: { group_id: string; kind: string; blob: string; version: number }[] = [];
    const sql = (strings: TemplateStringsArray, ...v: unknown[]) => {
        const q = strings.join('?').trim();
        if (q.startsWith('SELECT kind')) return Promise.resolve(rows.filter(r => r.group_id === v[0]));
        if (q.startsWith('SELECT blob')) return Promise.resolve(rows.filter(r => r.group_id === v[0] && r.kind === v[1]));
        if (q.startsWith('INSERT')) {
            if (rows.some(r => r.group_id === v[0] && r.kind === v[1])) return Promise.resolve([]);
            rows.push({ group_id: v[0] as string, kind: v[1] as string, blob: v[2] as string, version: 1 });
            return Promise.resolve([{ version: 1 }]);
        }
        const row = rows.find(r => r.group_id === v[1] && r.kind === v[2] && r.version === v[3]);
        if (!row) return Promise.resolve([]);
        row.blob = v[0] as string;
        row.version += 1;
        return Promise.resolve([{ version: row.version }]);
    };
    const handlers = { syncGet: makeSyncGet(() => sql), syncPut: makeSyncPut(() => sql) };
    const post: SyncDeps['post'] = async (fn, body) => {
        const res = await handlers[fn](new Request('http://local', { method: 'POST', body: JSON.stringify(body) }));
        return { status: res.status, body: await res.json() };
    };
    return { post, rows };
};
const device = (post: SyncDeps['post'], now = () => 1000): SyncDeps => ({ post, storage: memoryStorage(), now });
const entry = (id: string, updatedAt: number): HistoryEntry =>
    ({ id, endedAt: new Date(updatedAt).toISOString(), game: 'poker', nets: [], transactions: [], summary: [], updatedAt });

test('two devices converge on players and history; a delete on one is a delete on both', async () => {
    const key = newGroupKey();
    const { post } = server();
    const a = device(post);
    const b = device(post);
    writeSavedPlayers([{ name: 'Asha', phone: '9000000001', updatedAt: 10 }], a.storage);
    writeSavedPlayers([{ name: 'Raj', phone: '9000000002', updatedAt: 20 }], b.storage);
    writeHistory([entry('g1', 100)], a.storage);
    await syncOnce(key, a);
    await syncOnce(key, b);
    await syncOnce(key, a);
    for (const d of [a, b]) {
        assert.deepEqual(loadAllSavedPlayers(d.storage).list.map(p => p.phone).sort(), ['9000000001', '9000000002']);
        assert.deepEqual(readHistory(d.storage).map(e => e.id), ['g1']);
    }
    writeSavedPlayers(loadAllSavedPlayers(b.storage).list.map(p => (p.phone === '9000000001' ? { ...p, deleted: true, updatedAt: 30 } : p)), b.storage);
    await syncOnce(key, b);
    await syncOnce(key, a);
    assert.equal(loadAllSavedPlayers(a.storage).list.find(p => p.phone === '9000000001')?.deleted, true);
});

test('a write between pull and push is merged and retried, not lost', async () => {
    const key = newGroupKey();
    const shared = server();
    const b = device(shared.post);
    writeSavedPlayers([{ name: 'Raj', phone: '9000000002', updatedAt: 20 }], b.storage);
    let raced = false;
    const a = device(async (fn, body) => {
        if (fn === 'syncPut' && !raced) {
            raced = true;
            await syncOnce(key, b); // B sneaks in first
        }
        return shared.post(fn, body);
    });
    writeSavedPlayers([{ name: 'Asha', phone: '9000000001', updatedAt: 10 }], a.storage);
    await syncOnce(key, a);
    assert.deepEqual(loadAllSavedPlayers(a.storage).list.map(p => p.phone).sort(), ['9000000001', '9000000002']);
    await syncOnce(key, b);
    assert.deepEqual(loadAllSavedPlayers(b.storage).list.map(p => p.phone).sort(), ['9000000001', '9000000002']);
});

test('damaged data fails without touching local data; server trouble reads plainly', async () => {
    const key = newGroupKey();
    const shared = server();
    const first = device(shared.post);
    writeSavedPlayers([{ name: 'Esha', phone: '9000000004', updatedAt: 10 }], first.storage);
    await syncOnce(key, first);
    shared.rows.forEach(r => { r.blob = 'QUJDRA=='; });
    const victim = device(shared.post);
    writeSavedPlayers([{ name: 'Dev', phone: '9000000003', updatedAt: 10 }], victim.storage);
    const error = await syncOnce(key, victim).catch(e => e);
    assert.equal(failureText(error), 'Sync failed: wrong group key or damaged data.');
    assert.deepEqual(loadAllSavedPlayers(victim.storage).list.map(p => p.name), ['Dev']);
    assert.equal(failureText(new SyncError("sync isn't set up on the server yet")), "Sync failed: sync isn't set up on the server yet");
    assert.equal(failureText(new TypeError('fetch failed')), "Sync failed: couldn't reach the server");
});

test('the synced time reads like "Synced 9:45 pm"', () => {
    assert.equal(syncedAt(new Date(2026, 10, 10, 21, 45).getTime()), 'Synced 9:45 pm');
    assert.equal(syncedAt(new Date(2026, 10, 10, 0, 5).getTime()), 'Synced 12:05 am');
    assert.equal(syncedAt(new Date(2026, 10, 10, 12, 0).getTime()), 'Synced 12:00 pm');
});

test('unknown fields from the other app pass through; endedAt with or without an offset sorts by time', async () => {
    const { playerFromWire, playerToWire, mergeHistory } = await import('./syncMerge.ts');
    const wire = { phone: '9000000001', name: 'Asha', upi: null, color: 3, emoji: null, updatedAt: 5, deleted: false, nickname: 'A' };
    const back = playerFromWire(wire as never)!;
    assert.equal((back as unknown as { nickname: string }).nickname, 'A');
    assert.deepEqual(playerToWire(back), wire);
    const local = new Date(2026, 10, 10, 5, 40);
    const offsetless = `2026-11-10T05:40:00.000`; // Android 1.2.0: local time, no offset
    const later = new Date(local.getTime() + 60000).toISOString();
    const merged = mergeHistory([{ ...entry('a', 1), endedAt: offsetless }], [{ ...entry('b', 1), endedAt: later, extra: 1 } as never], 0);
    assert.deepEqual(merged.map(e => e.id), ['b', 'a']);
    assert.equal((merged[0] as unknown as { extra: number }).extra, 1);
});
