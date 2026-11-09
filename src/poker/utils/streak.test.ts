import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldOutLine, foldOutStreak, nextStreak, potLine } from './streak.ts';
import { WIN_PATTERN } from '../../utils/winPattern.ts';

const player = (over: Partial<{ winningStreak: number; isTakingBreak: boolean; stack: number; totalPotContribution: number }> = {}) =>
    ({ winningStreak: 2, isTakingBreak: false, stack: 500, totalPotContribution: 100, ...over });

test('ending the hand up money extends the streak', () => {
    assert.equal(nextStreak(player(), 150), 3);
});

test('a player who played and is not up resets, including one who only got their own chips back', () => {
    assert.equal(nextStreak(player(), 100), 0);
    assert.equal(nextStreak(player(), 0), 0);
    assert.equal(nextStreak(player({ stack: 0 }), 0), 0);
});

test('players not dealt in keep their streak', () => {
    assert.equal(nextStreak(player({ isTakingBreak: true, totalPotContribution: 0 }), 0), 2);
    assert.equal(nextStreak(player({ stack: 0, totalPotContribution: 0 }), 0), 2);
});

test('a fold-out extends only the winner\'s streak, when they are up', () => {
    assert.equal(foldOutStreak({ ...player(), id: 1 }, 1, 150), 3);
    assert.equal(foldOutStreak({ ...player(), id: 2 }, 1, 150), 0);
    assert.equal(foldOutStreak({ ...player(), id: 1 }, 1, 100), 0);
});

test('a fold-out win is celebrated, getting only your own chips back is not', () => {
    assert.match(foldOutLine('Asha', 150, 100, 1050), WIN_PATTERN);
    assert.equal(foldOutLine('Asha', 10, 10, 1000), 'Everyone folded; Asha takes back their own ₹10. Their final stack is ₹1000.');
    assert.doesNotMatch(foldOutLine('Asha', 10, 10, 1000), WIN_PATTERN);
});

test('a contested pot is a win line, a one-player pot is not', () => {
    assert.match(potLine(['Asha', 'Ravi'], 40, 2, 20, ''), WIN_PATTERN);
    assert.equal(potLine(['Ravi'], 700, 1, 700, ''), '₹700 goes to Ravi, the only player left in this pot.');
    assert.doesNotMatch(potLine(['Ravi'], 700, 1, 700, ''), WIN_PATTERN);
});
