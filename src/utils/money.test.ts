import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEvenly } from './money.ts';

test('uneven split keeps every rupee, leftover to the first shares', () => {
    assert.deepEqual(splitEvenly(100, 3), [34, 33, 33]);
    assert.deepEqual(splitEvenly(25, 2), [13, 12]);
});

test('even split and fractional amounts sum exactly', () => {
    assert.deepEqual(splitEvenly(90, 3), [30, 30, 30]);
    assert.deepEqual(splitEvenly(10.5, 2), [5.5, 5]);
});
