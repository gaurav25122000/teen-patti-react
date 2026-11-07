import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAME_LENGTH, parseHostMessage, parseViewerMessage } from './streamProtocol.ts';

test('viewer messages: valid ones pass, anything else is dropped', () => {
    assert.deepEqual(parseViewerMessage({ type: 'viewer-name', name: 'Ravi' }), { type: 'viewer-name', name: 'Ravi' });
    assert.deepEqual(parseViewerMessage({ type: 'viewer-name', name: null }), { type: 'viewer-name', name: null });
    assert.deepEqual(parseViewerMessage({ type: 'handover-reply', accepted: true }), { type: 'handover-reply', accepted: true });

    assert.equal(parseViewerMessage({ type: 'viewer-name', name: 'x'.repeat(MAX_NAME_LENGTH + 1) }), null);
    assert.equal(parseViewerMessage({ type: 'viewer-name', name: 42 }), null);
    assert.equal(parseViewerMessage({ type: 'handover-reply', accepted: 'yes' }), null);
    assert.equal(parseViewerMessage({ type: 'state', state: {} }), null);
    assert.equal(parseViewerMessage('hello'), null);
    assert.equal(parseViewerMessage(null), null);
});

test('host messages: state, handover and host-moved; old hosts send raw state', () => {
    const state = { players: [], gameType: 'poker' };
    assert.deepEqual(parseHostMessage({ type: 'state', state }), { type: 'state', state });
    assert.deepEqual(parseHostMessage({ type: 'handover', state }), { type: 'handover', state });
    assert.deepEqual(parseHostMessage({ type: 'host-moved', to: 'Ravi' }), { type: 'host-moved', to: 'Ravi' });
    assert.deepEqual(parseHostMessage({ type: 'handover-confirmed' }), { type: 'handover-confirmed' });
    assert.deepEqual(parseHostMessage(state), { type: 'state', state });

    assert.equal(parseHostMessage({ type: 'host-moved', to: 'x'.repeat(100) })?.type, 'host-moved');
    assert.equal((parseHostMessage({ type: 'host-moved', to: 'x'.repeat(100) }) as { to: string }).to.length, MAX_NAME_LENGTH);
    assert.equal(parseHostMessage({ type: 'state', state: [1, 2] }), null);
    assert.equal(parseHostMessage({ type: 'unknown' }), null);
    assert.equal(parseHostMessage({ notAGame: true }), null);
});
