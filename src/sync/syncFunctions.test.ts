import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error -- plain JS Netlify functions
import { makeSyncGet } from '../../netlify/functions/syncGet.js';
// @ts-expect-error -- plain JS Netlify functions
import { makeSyncPut } from '../../netlify/functions/syncPut.js';

// An in-memory sync_blobs table behind a tagged-template sql, enough for the four queries the functions run.
const fakeDb = (missingTable = false) => {
    const rows: { group_id: string; kind: string; blob: string; version: number }[] = [];
    const sql = (strings: TemplateStringsArray, ...v: unknown[]) => {
        if (missingTable) return Promise.reject(Object.assign(new Error('relation "sync_blobs" does not exist'), { code: '42P01' }));
        const q = strings.join('?').trim();
        if (q.startsWith('SELECT kind')) return Promise.resolve(rows.filter(r => r.group_id === v[0]));
        if (q.startsWith('SELECT blob')) return Promise.resolve(rows.filter(r => r.group_id === v[0] && r.kind === v[1]));
        if (q.startsWith('INSERT')) {
            if (rows.some(r => r.group_id === v[0] && r.kind === v[1])) return Promise.resolve([]);
            rows.push({ group_id: v[0] as string, kind: v[1] as string, blob: v[2] as string, version: 1 });
            return Promise.resolve([{ version: 1 }]);
        }
        if (q.startsWith('UPDATE')) {
            const row = rows.find(r => r.group_id === v[1] && r.kind === v[2] && r.version === v[3]);
            if (!row) return Promise.resolve([]);
            row.blob = v[0] as string;
            row.version += 1;
            return Promise.resolve([{ version: row.version }]);
        }
        throw new Error(`unexpected query ${q}`);
    };
    return { rows, getSql: () => sql };
};

const G = 'a'.repeat(64);
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = async (handler: (r: Request) => Promise<Response>, body: unknown) => {
    const res = await handler(post(body));
    return { status: res.status, body: await res.json() };
};

test('put inserts at version 1, updates on the matching version, and returns 409 with the newer blob otherwise', async () => {
    const db = fakeDb();
    const put = makeSyncPut(db.getSql);
    assert.deepEqual(await call(put, { groupId: G, kind: 'players', blob: 'QUJD', baseVersion: 0 }), { status: 200, body: { version: 1 } });
    assert.deepEqual(await call(put, { groupId: G, kind: 'players', blob: 'REVG', baseVersion: 0 }), { status: 409, body: { blob: 'QUJD', version: 1 } });
    assert.deepEqual(await call(put, { groupId: G, kind: 'players', blob: 'REVG', baseVersion: 1 }), { status: 200, body: { version: 2 } });
    assert.deepEqual(await call(put, { groupId: G, kind: 'players', blob: 'R0hJ', baseVersion: 1 }), { status: 409, body: { blob: 'REVG', version: 2 } });
    assert.deepEqual(await call(put, { groupId: G, kind: 'history', blob: 'QUJD', baseVersion: 3 }), { status: 409, body: { blob: null, version: 0 } });
});

test('get returns both kinds, null where nothing is stored', async () => {
    const db = fakeDb();
    await makeSyncPut(db.getSql)(post({ groupId: G, kind: 'history', blob: 'QUJD', baseVersion: 0 }));
    assert.deepEqual(await call(makeSyncGet(db.getSql), { groupId: G }), { status: 200, body: { players: null, history: { blob: 'QUJD', version: 1 } } });
});

test('bad bodies are 400, a huge blob is 413, never 500', async () => {
    const put = makeSyncPut(fakeDb().getSql);
    const ok = { groupId: G, kind: 'players', blob: 'QUJD', baseVersion: 0 };
    for (const bad of ['{nope', [], { ...ok, extra: 1 }, { ...ok, groupId: 'A'.repeat(64) }, { ...ok, groupId: 'a'.repeat(63) }, { ...ok, kind: 'stats' },
        { ...ok, baseVersion: 1.5 }, { ...ok, baseVersion: -1 }, { ...ok, baseVersion: '0' }, { ...ok, blob: 'not base64!' }, { ...ok, blob: 'QUJ' }, { ...ok, blob: '' }, { ...ok, blob: 5 }]) {
        assert.equal((await call(put, bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call(put, { ...ok, blob: 'A'.repeat(2_000_004) })).status, 413);
    assert.equal((await call(put, { ...ok, blob: 'A'.repeat(2_000_000) })).status, 200);
    const get = makeSyncGet(fakeDb().getSql);
    for (const bad of ['{nope', { groupId: 'xyz' }, { groupId: G, extra: 1 }, null]) assert.equal((await call(get, bad)).status, 400);
});

test('a missing table is 503 with the setup message', async () => {
    const msg = { error: "Sync isn't set up on the server yet." };
    assert.deepEqual(await call(makeSyncGet(fakeDb(true).getSql), { groupId: G }), { status: 503, body: msg });
    assert.deepEqual(await call(makeSyncPut(fakeDb(true).getSql), { groupId: G, kind: 'players', blob: 'QUJD', baseVersion: 0 }), { status: 503, body: msg });
});
