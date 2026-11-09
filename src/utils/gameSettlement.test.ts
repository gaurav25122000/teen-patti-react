import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackjackSettlement, pokerSettlement, teenPattiSettlement } from './gameSettlement.ts';

const tpPlayer = (id: number, name: string, balance: number) => ({ id, name, balance, isTakingBreak: false });

test('teen patti between rounds: nets are balances', () => {
    const { nets, transactions } = teenPattiSettlement({
        players: [tpPlayer(1, 'asha', 20), tpPlayer(2, 'Raj', -20)],
        entities: [],
        roundActive: false,
        roundContributions: new Map(),
    });
    assert.deepEqual(nets, [{ name: 'Asha', net: 20 }, { name: 'Raj', net: -20 }]);
    assert.deepEqual(transactions, [{ from: 'Raj', to: 'Asha', amount: 20 }]);
});

test('teen patti mid-round: the unfinished round is voided, so nets still sum to 0', () => {
    const { nets, transactions } = teenPattiSettlement({
        players: [tpPlayer(1, 'Asha', 10), tpPlayer(2, 'Raj', -20), tpPlayer(3, 'Dev', -20)],
        entities: [],
        roundActive: true,
        roundContributions: new Map([[1, 10], [2, 10], [3, 10]]),
    });
    assert.deepEqual(nets, [{ name: 'Asha', net: 20 }, { name: 'Raj', net: -10 }, { name: 'Dev', net: -10 }]);
    assert.deepEqual(transactions, [{ from: 'Raj', to: 'Asha', amount: 10 }, { from: 'Dev', to: 'Asha', amount: 10 }]);
});

test('poker mid-hand: chips in the pot go back and pots already paid this hand are taken back', () => {
    const seat = (name: string, stack: number, totalPotContribution: number, roundWinnings: number) =>
        ({ name, stack, totalBuyIn: 1000, totalPotContribution, roundWinnings });
    const { nets } = pokerSettlement({
        players: [seat('Asha', 1300, 200, 400), seat('Raj', 800, 200, 0)] as never,
    });
    assert.deepEqual(nets, [{ name: 'Asha', net: 100 }, { name: 'Raj', net: 0 }]);
});

test('blackjack: the house is in the transactions, not in the nets', () => {
    const { nets, transactions } = blackjackSettlement({
        players: [{ name: 'Raj', stack: 700, totalBuyIn: 1000 }] as never,
        dealerNet: 300,
    });
    assert.deepEqual(nets, [{ name: 'Raj', net: -300 }]);
    assert.deepEqual(transactions, [{ from: 'Raj', to: 'Dealer (house)', amount: 300 }]);
});
