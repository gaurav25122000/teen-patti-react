import { test } from 'node:test';
import assert from 'node:assert/strict';
import { covers, parseAmount, splitEvenly } from './money.ts';

test('uneven split keeps every rupee, leftover to the first shares', () => {
    assert.deepEqual(splitEvenly(100, 3), [34, 33, 33]);
    assert.deepEqual(splitEvenly(25, 2), [13, 12]);
});

test('even split and fractional amounts sum exactly', () => {
    assert.deepEqual(splitEvenly(90, 3), [30, 30, 30]);
    assert.deepEqual(splitEvenly(10.5, 2), [5.5, 5]);
});

test('covers compares whole paise, so float drift never refuses a bet that fits', () => {
    assert.ok(covers(21 - 2.1 * 9, 2.1));
    assert.ok(!covers(2.09, 2.1));
});

test('a typed amount: whole paise, and 0 when blank, negative, not a number or above ₹1,00,000 crore', () => {
    assert.equal(parseAmount('2.345'), 2.35);
    assert.equal(parseAmount('1000000000000'), 1e12);
    assert.equal(parseAmount('1000000000001'), 0);
    assert.equal(parseAmount('-5'), 0);
    assert.equal(parseAmount('-5', true), -5);
    assert.equal(parseAmount('-1000000000001', true), 0);
    assert.equal(parseAmount(''), 0);
    assert.equal(parseAmount('abc'), 0);
});
