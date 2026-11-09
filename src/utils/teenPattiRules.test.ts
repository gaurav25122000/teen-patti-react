import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betRefusal, blindTurnsRefusal, bootRefusal, parseTableRules, potLimitLines, potLimitReached, roundCarryOver, tableRulesLine } from './teenPattiRules.ts';

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

test('a round reset keeps entities, table rules and the carried-in flag', () => {
    const entities = [{ id: 1, name: 'Team A' }];
    assert.deepEqual(
        roundCarryOver({ entities, potLimit: 500, maxBlindTurns: 3, maxChaal: 100, carriedIn: true }),
        { entities, carriedIn: true, potLimit: 500, maxBlindTurns: 3, maxChaal: 100 }
    );
});

test('max chaal: chaal above it, blind above half of it, boot above half of it', () => {
    const s = round({ maxChaal: 25 });
    assert.equal(betRefusal(s, 'chaal', 25, 'Raj', 0, false), null);
    assert.equal(betRefusal(s, 'chaal', 26, 'Raj', 0, false), 'Max chaal is ₹25.');
    assert.equal(betRefusal(s, 'blind', 12, 'Raj', 0, true), null);
    assert.equal(betRefusal(s, 'blind', 13, 'Raj', 0, true), 'Max blind bet is ₹12.5.');
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

test('rules log line names each rule or says it is off', () => {
    assert.equal(tableRulesLine({ potLimit: 5000, maxBlindTurns: 4, maxChaal: 200 }), 'Table rules: pot limit ₹5000, max 4 blind turns, max chaal ₹200');
    assert.equal(tableRulesLine({}), 'Table rules: no pot limit, no blind limit, no max chaal');
});

test('rule fields: empty is off, values must be positive, blind turns 1 to 20', () => {
    assert.deepEqual(parseTableRules({ potLimit: '', maxBlindTurns: ' ', maxChaal: '' }), {});
    assert.deepEqual(parseTableRules({ potLimit: '5000', maxBlindTurns: '20', maxChaal: '200' }), { potLimit: 5000, maxBlindTurns: 20, maxChaal: 200 });
    assert.equal(parseTableRules({ potLimit: '0', maxBlindTurns: '', maxChaal: '' }), 'Table rules must be positive numbers.');
    assert.equal(parseTableRules({ potLimit: '', maxBlindTurns: '', maxChaal: 'abc' }), 'Table rules must be positive numbers.');
    assert.equal(parseTableRules({ potLimit: '', maxBlindTurns: '21', maxChaal: '' }), 'Max blind turns must be 1 to 20.');
    assert.equal(parseTableRules({ potLimit: '', maxBlindTurns: '2.5', maxChaal: '' }), 'Max blind turns must be 1 to 20.');
});
