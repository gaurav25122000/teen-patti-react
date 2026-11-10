import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betRefusal, blindTurnsRefusal, bootRefusal, dealerOf, nextBoot, potLimitLines, potLimitReached, roundCarryOver } from './teenPattiRules.ts';

const round = (over = {}) => ({ potAmount: 100, roundActive: true, ...over });

test('pot limit is reached at or above the limit, only in a running round', () => {
    assert.equal(potLimitReached(round({ potLimit: 100 })), true);
    assert.equal(potLimitReached(round({ potLimit: 101 })), false);
    assert.equal(potLimitReached(round({ potLimit: 100, roundActive: false })), false);
    assert.equal(potLimitReached(round()), false);
});

test('a bet that takes the pot to the limit gets the limit line', () => {
    assert.deepEqual(potLimitLines(500, 500), ['Pot limit ₹500 reached. Everyone still in shows; pick the winner.']);
    assert.deepEqual(potLimitLines(500, 499), []);
    assert.deepEqual(potLimitLines(undefined, 10000), []);
});

test('once the limit is reached, blind, chaal and show bets are refused', () => {
    const s = round({ potLimit: 100 });
    const line = 'Pot limit ₹100 reached. Everyone still in shows; pick the winner.';
    assert.equal(betRefusal(s, 'blind', 10, 'Raj', 0, true), line);
    assert.equal(betRefusal(s, 'chaal', 20, 'Raj', 0, false), line);
    assert.equal(betRefusal(s, 'show', 20, 'Raj', 0, false), line);
});

test('max blind turns: refused once the count equals the max', () => {
    const s = round({ maxBlindTurns: 3 });
    assert.equal(betRefusal(s, 'blind', 10, 'Raj', 2, true), null);
    assert.equal(betRefusal(s, 'blind', 10, 'Raj', 3, true), 'Raj has played 3 blind turns and must see.');
    assert.equal(blindTurnsRefusal(s, 'Raj', 3), 'Raj has played 3 blind turns and must see.');
    assert.equal(betRefusal(s, 'chaal', 10, 'Raj', 3, false), null);
});

test('a blind player past the blind-turn limit cannot show; a seen player can', () => {
    const s = round({ maxBlindTurns: 3 });
    assert.equal(betRefusal(s, 'show', 20, 'Raj', 3, true), 'Raj has played 3 blind turns and must see.');
    assert.equal(betRefusal(s, 'show', 20, 'Raj', 2, true), null);
    assert.equal(betRefusal(s, 'show', 20, 'Raj', 3, false), null);
});

test('a round reset keeps groups, departures, every setting, the round count and the start time', () => {
    const entities = [{ id: 1, name: 'Team A' }];
    const departed = [{ name: 'Dev', net: -5 }];
    const kept = { entities, departed, carriedIn: true, potLimit: 500, maxBlindTurns: 3, maxChaal: 100, defaultBoot: 20, turnTimer: 30, bootRiseEvery: 5, bootRiseStep: 10, roundsStarted: 7, startedAt: 1234, settleThrough: 'Raj' };
    assert.deepEqual(roundCarryOver({ ...kept, players: [], potAmount: 99 } as never), kept);
});

test('boot rise: every N rounds since setup, at round N+1, 2N+1', () => {
    const rise = { bootRiseEvery: 3, bootRiseStep: 10 };
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(roundsStarted => nextBoot({ ...rise, roundsStarted }, 50)), [50, 50, 50, 60, 50, 50, 60]);
    assert.equal(nextBoot({ roundsStarted: 3 }, 50), 50);
});

test('the D badge: this round\'s dealer, else the last winner, else the first player', () => {
    const players = [{ id: 1 }, { id: 2 }, { id: 3 }] as never;
    assert.equal(dealerOf({ roundActive: true, dealerId: 3, lastWinnerId: 2, players }), 3);
    assert.equal(dealerOf({ roundActive: false, dealerId: 3, lastWinnerId: 2, players }), 2);
    assert.equal(dealerOf({ roundActive: false, lastWinnerId: null, players }), 1);
    assert.equal(dealerOf({ roundActive: false, lastWinnerId: 9, players }), 1);
});

test('max chaal: chaal above it, blind above half of it, boot above half of it', () => {
    const s = round({ maxChaal: 25 });
    assert.equal(betRefusal(s, 'chaal', 25, 'Raj', 0, false), null);
    assert.equal(betRefusal(s, 'chaal', 26, 'Raj', 0, false), 'Max chaal is ₹25.');
    assert.equal(betRefusal(s, 'blind', 12, 'Raj', 0, true), null);
    assert.equal(betRefusal(s, 'blind', 13, 'Raj', 0, true), 'Max blind bet is ₹12.50.');
    assert.equal(betRefusal(s, 'show', 100, 'Raj', 0, false), null);
    assert.equal(bootRefusal({ maxChaal: 100 }, 50), null);
    assert.equal(bootRefusal({ maxChaal: 100 }, 51), 'Boot is above the max blind bet (₹50).');
    assert.equal(bootRefusal({}, 1000), null);
});

test('no rules, nothing refused', () => {
    assert.equal(betRefusal(round(), 'blind', 1000, 'Raj', 50, true), null);
    assert.equal(betRefusal(round(), 'chaal', 1000, 'Raj', 0, false), null);
    assert.equal(betRefusal(round(), 'show', 1000, 'Raj', 50, true), null);
});

