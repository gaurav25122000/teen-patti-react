import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackjackChange, parseBlackjack, parsePoker, parseTeenPatti, pokerChange, teenPattiChange } from './gameSettings.ts';

test('teen patti settings: blank is off; each bad value has its message', () => {
    assert.deepEqual(parseTeenPatti({ defaultBoot: '10', potLimit: '', maxBlindTurns: '3', maxChaal: '', turnTimer: '30', bootRiseEvery: '5', bootRiseStep: '10' }),
        { defaultBoot: 10, potLimit: undefined, maxBlindTurns: 3, maxChaal: undefined, turnTimer: 30, bootRiseEvery: 5, bootRiseStep: 10 });
    assert.equal(parseTeenPatti({ potLimit: '0' }), 'Table rules must be positive numbers.');
    assert.equal(parseTeenPatti({ maxBlindTurns: '21' }), 'Max blind turns must be 1 to 20.');
    assert.equal(parseTeenPatti({ turnTimer: '4' }), 'Turn timer must be 5 to 300 seconds.');
    assert.equal(parseTeenPatti({ turnTimer: '301' }), 'Turn timer must be 5 to 300 seconds.');
    assert.equal(parseTeenPatti({ bootRiseEvery: '5' }), 'Boot rise needs both the rounds and the amount.');
    assert.equal(parseTeenPatti({ bootRiseEvery: '1.5', bootRiseStep: '10' }), 'Counts must be whole numbers of at least 1.');
    assert.equal(parseTeenPatti({ bootRiseEvery: '2', bootRiseStep: '-1' }), 'Amounts must be positive numbers.');
});

test('poker settings: blinds, buy-in limits, bomb pot and counts', () => {
    const ok = { smallBlindAmount: '10', bigBlindAmount: '20' };
    assert.deepEqual(parsePoker({ ...ok, straddle: 'on', ante: '5' }), {
        levelMinutes: undefined, ante: 5, turnTimer: undefined, maxRebuys: undefined, rebuyUntilLevel: undefined, addOnAmount: undefined,
        minBuyIn: undefined, maxBuyIn: undefined, bombEvery: undefined, bombAmount: undefined, smallBlindAmount: 10, bigBlindAmount: 20, straddle: true,
    });
    assert.equal(parsePoker({ smallBlindAmount: '10', bigBlindAmount: '' }), 'Blinds must be positive numbers.');
    assert.equal(parsePoker({ smallBlindAmount: '20', bigBlindAmount: '10' }), 'Big blind must be at least the small blind.');
    assert.equal(parsePoker({ ...ok, levelMinutes: '241' }), 'Blind level must be 1 to 240 minutes.');
    assert.equal(parsePoker({ ...ok, maxRebuys: '0' }), 'Counts must be whole numbers of at least 1.');
    assert.equal(parsePoker({ ...ok, minBuyIn: '500', maxBuyIn: '100' }), "Min buy-in can't be more than max buy-in.");
    assert.equal(parsePoker({ ...ok, bombAmount: '50' }), 'Bomb pot needs both the hands and the amount.');
    assert.equal(parsePoker({ ...ok, ante: 'x' }), 'Amounts must be positive numbers.');
});

test('blackjack settings', () => {
    assert.deepEqual(parseBlackjack({ blackjackPayout: '6to5', allowSurrender: 'on', minBet: '10', maxBet: '500', insurance: '', defaultHands: '2', bankerEvery: '', sideBets: 'on' }),
        { blackjackPayout: '6to5', allowSurrender: true, minBet: 10, maxBet: 500, insurance: false, defaultHands: 2, bankerEvery: undefined, sideBets: true });
    assert.equal(parseBlackjack({ minBet: '600', maxBet: '500', defaultHands: '1' }), 'Min bet must be positive and no more than max bet.');
    assert.equal(parseBlackjack({ minBet: '10', maxBet: '500', defaultHands: '6' }), 'Hands per player must be 1 to 5.');
    assert.equal(parseBlackjack({ minBet: '10', maxBet: '500', defaultHands: '1', bankerEvery: '0' }), 'Counts must be whole numbers of at least 1.');
});

test('the settings line names only what changed, "off" for a cleared value', () => {
    assert.equal(teenPattiChange({ potLimit: 500 }, { potLimit: 500 }), null);
    assert.equal(teenPattiChange({ potLimit: 500, turnTimer: undefined }, { potLimit: undefined, turnTimer: 30 }), 'Settings: pot limit off, turn timer 30 s');
    assert.equal(teenPattiChange({}, { bootRiseEvery: 5, bootRiseStep: 10, defaultBoot: 20 }), 'Settings: boot ₹20, boot rise ₹10 every 5 rounds');
    const poker = { smallBlindAmount: 10, bigBlindAmount: 20, straddle: false };
    assert.equal(pokerChange(poker, { ...poker, ante: 10, turnTimer: 30 }), 'Settings: ante ₹10, turn timer 30 s');
    assert.equal(pokerChange(poker, { ...poker, smallBlindAmount: 25, bigBlindAmount: 50, straddle: true, bombEvery: 10, bombAmount: 50 }), 'Settings: blinds ₹25/₹50, straddle on, bomb pot ₹50 every 10 hands');
    const bj = { blackjackPayout: '3to2' as const, allowSurrender: true, minBet: 10, maxBet: 1000, insurance: true, defaultHands: 1, sideBets: false };
    assert.equal(blackjackChange(bj, { ...bj, blackjackPayout: '6to5', insurance: false, bankerEvery: 5 }), 'Settings: payout 6:5, insurance off, banker every 5 rounds');
    assert.equal(blackjackChange({ ...bj, bankerEvery: 5 }, bj), 'Settings: banker off');
});
