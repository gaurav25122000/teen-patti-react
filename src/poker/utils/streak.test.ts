import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldOutLine, foldOutStreak, handCandidate, handNets, nextStreak, potLine } from './streak.ts';
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

const seat = (name: string, over: Partial<{ stack: number; totalPotContribution: number; roundWinnings: number; isTakingBreak: boolean; phoneNumber: string }> = {}) =>
    ({ name, winningStreak: 0, isTakingBreak: false, stack: 500, totalPotContribution: 0, roundWinnings: 0, ...over });

test('hand nets: dealt-in players only, winnings minus chips in the pot, keyed by party', () => {
    assert.deepEqual(handNets([
        seat('asha', { totalPotContribution: 100, roundWinnings: 250, phoneNumber: '9000000001' }),
        seat('Ravi', { stack: 0, totalPotContribution: 150 }),
        seat('Dev'),
        seat('Esha', { isTakingBreak: true }),
        seat('Kiran', { stack: 0 }),
    ]), { '9000000001': 150, 'name:Ravi': -150, 'name:Dev': 0 });
});

test('biggest pot is the contested pot, named for the largest net', () => {
    // P1 300 all-in, P2 1000 all-in, P3 10; P1 wins 610 and P2 gets 700 uncalled back.
    const hand = [
        seat('p1', { stack: 0, totalPotContribution: 300, roundWinnings: 610 }),
        seat('P2', { stack: 700, totalPotContribution: 1000, roundWinnings: 700 }),
        seat('P3', { totalPotContribution: 10 }),
    ];
    assert.deepEqual(handCandidate(hand), { key: 'name:P1', amount: 610 });
});

test('biggest pot on a fold-out is named for the winner', () => {
    const foldOut = [seat('Asha', { totalPotContribution: 100 }), seat('Ravi', { totalPotContribution: 20 })];
    assert.deepEqual(handCandidate(foldOut, foldOut[0]), { key: 'name:Asha', amount: 40 });
    assert.equal(handCandidate([]), null);
});

test('a chopped pot goes to the dealt-in player with the biggest net, then the most chips back', () => {
    const chop = [
        seat('Dev', { isTakingBreak: true }),
        seat('Kiran', { stack: 0 }),
        seat('Asha', { totalPotContribution: 20, roundWinnings: 20 }),
        seat('Ravi', { totalPotContribution: 40, roundWinnings: 40 }),
    ];
    assert.deepEqual(handCandidate(chop), { key: 'name:Ravi', amount: 40 });
    const even = [seat('Asha', { totalPotContribution: 20, roundWinnings: 20 }), seat('Ravi', { totalPotContribution: 20, roundWinnings: 20 })];
    assert.deepEqual(handCandidate(even), { key: 'name:Asha', amount: 40 });
});
