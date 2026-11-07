import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_LIMIT, mergeLog } from './log.ts';

test('lines written during an update go before the lines it appended', () => {
    const prev = ['a'];
    assert.deepEqual(mergeLog(prev, [...prev, 'Player turn: Asha'], ['--- NEW ROUND ---', 'Auto-betting']), ['a', '--- NEW ROUND ---', 'Auto-betting', 'Player turn: Asha']);
});

test('an update that returned the previous state still keeps its lines (rejected action)', () => {
    const prev = ['a'];
    assert.deepEqual(mergeLog(prev, prev, ['Cannot check, there is a bet to you.']), ['a', 'Cannot check, there is a bet to you.']);
});

test('a rebuilt log gets the written lines at the end; nothing written changes nothing', () => {
    assert.deepEqual(mergeLog(['a', 'b'], ['b', 'HAND OVER'], ['Asha folds.']), ['b', 'HAND OVER', 'Asha folds.']);
    const next = ['x'];
    assert.equal(mergeLog(['a'], next, []), next);
});

test('log is capped', () => {
    const prev = Array.from({ length: LOG_LIMIT }, (_, i) => `line ${i}`);
    const merged = mergeLog(prev, prev, ['new']);
    assert.equal(merged.length, LOG_LIMIT);
    assert.equal(merged.at(-1), 'new');
});
