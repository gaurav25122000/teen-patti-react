import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pokerChips, stepDown, stepUp, teenPattiChips, teenPattiMinBet } from './quickBets.ts';

test('the stepper moves one step and never goes below the floor', () => {
    assert.equal(stepDown(30, 20, 20), 20);
    assert.equal(stepDown(60, 20, 20), 40);
    assert.equal(stepUp(10, 20, 40), 40);
    assert.equal(stepUp(40, 20, 40), 60);
});

test('Teen Patti chips are 1×, 2× and 4× the minimum bet (the stake when blind, twice it when seen)', () => {
    assert.equal(teenPattiMinBet(10, true), 10);
    assert.equal(teenPattiMinBet(10, false), 20);
    assert.deepEqual(teenPattiChips(20).map(c => c.amount), [20, 40, 80]);
});

test('poker chips: ½ POT, POT, 2× and 3× the bet, clamped to [min raise, all-in]', () => {
    assert.deepEqual(pokerChips({ pot: 75, currentBet: 20, bigBlind: 10, minTotal: 40, maxTotal: 500 }).map(c => [c.label, c.amount]),
        [['½ POT', 40], ['POT', 75], ['2×', 40], ['3×', 60]]);
    assert.deepEqual(pokerChips({ pot: 1000, currentBet: 0, bigBlind: 10, minTotal: 10, maxTotal: 300 }).map(c => c.amount), [300, 300, 20, 30]);
    assert.deepEqual(pokerChips({ pot: 15, currentBet: 0, bigBlind: 10, minTotal: 10, maxTotal: 300 }).map(c => c.amount), [10, 15, 20, 30]);
});
