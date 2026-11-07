import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack } from 'peerjs-js-binarypack';
import { rehydrateState, sanitizeState } from './serialization.ts';

// Same path as a stream message: sanitize, PeerJS's BinaryPack wire format, rehydrate.
const roundTrip = async (state: unknown) => rehydrateState(unpack(await pack(sanitizeState(state))));

test('teen patti roundContributions survives as a Map', async () => {
    const state = await roundTrip({ roundContributions: new Map([[1, 10], [2, 20]]) });

    assert.ok(state.roundContributions instanceof Map);
    assert.equal(state.roundContributions.get(2), 20);
});

test('Set fields survive as Sets, nested ones too', async () => {
    const state = await roundTrip({ foldedPlayerIds: new Set([3]), pot: [{ eligiblePlayers: new Set([1, 2]) }] });

    assert.deepEqual(state.foldedPlayerIds, new Set([3]));
    assert.deepEqual(state.pot[0].eligiblePlayers, new Set([1, 2]));
});
