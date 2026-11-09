import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStateFromLocalStorage } from './localStorage.ts';

const withSaved = (value: object) => {
    const items = new Map([['teenPattiGameState', JSON.stringify(value)]]);
    (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => { items.set(k, v); },
        removeItem: (k: string) => { items.delete(k); },
    };
};

const players = [{ id: 1, name: 'Asha', balance: 50, entityId: 7 }, { id: 2, name: 'Raj', balance: -50, entityId: 9 }];

test('a save from before stats existed loads with partial stats; a newer save keeps its own', () => {
    withSaved({ players, entities: [] });
    assert.equal(loadStateFromLocalStorage()?.stats?.partial, true);
    withSaved({ players, entities: [], stats: { rounds: 2, wins: {}, streaks: {}, bestStreak: null, biggest: null } });
    assert.equal(loadStateFromLocalStorage()?.stats?.rounds, 2);
    assert.equal(loadStateFromLocalStorage()?.stats?.partial, undefined);
});

test('a player pointing at an entity that no longer exists is unassigned on load', () => {
    withSaved({ players, entities: [{ id: 9, name: 'Team' }] });
    const loaded = loadStateFromLocalStorage()!;
    assert.equal(loaded.players[0].entityId, undefined);
    assert.equal(loaded.players[1].entityId, 9);
});

test('stored phones are trimmed and a blank one becomes no phone', () => {
    withSaved({ players: [{ id: 1, name: 'Asha', balance: 0, phoneNumber: ' 9000000001 ' }, { id: 2, name: 'Raj', balance: 0, phoneNumber: '   ' }], entities: [] });
    const loaded = loadStateFromLocalStorage()!;
    assert.equal(loaded.players[0].phoneNumber, '9000000001');
    assert.equal(loaded.players[1].phoneNumber, undefined);
});
