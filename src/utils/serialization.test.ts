import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rehydrateState, sanitizeState } from './serialization.ts';

// Mirrors the PeerJS wire: sanitized state must survive JSON-like transport.
const roundTrip = (state: unknown) => rehydrateState(JSON.parse(JSON.stringify(sanitizeState(state))));

test('teen patti roundContributions survives as a Map', () => {
    const state = roundTrip({ roundContributions: new Map([[1, 10], [2, 20]]) });

    assert.ok(state.roundContributions instanceof Map);
    assert.equal(state.roundContributions.get(2), 20);
});

test('Set fields survive as Sets, nested ones too', () => {
    const state = roundTrip({ foldedPlayerIds: new Set([3]), pot: [{ eligiblePlayers: new Set([1, 2]) }] });

    assert.deepEqual(state.foldedPlayerIds, new Set([3]));
    assert.deepEqual(state.pot[0].eligiblePlayers, new Set([1, 2]));
});
