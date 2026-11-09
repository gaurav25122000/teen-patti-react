import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depart, departureNote, tooFewToRemove } from './departures.ts';
import * as TP from '../hooks/teenPattiEngine.ts';
import * as PK from '../poker/engine.ts';
import * as BJ from '../blackjack/engine.ts';
import { runStep } from './engine.ts';
import { blackjackSettlement, playerNets, pokerSettlement, teenPattiSettlement } from './gameSettlement.ts';

test('a departure keeps the result; the same person and group leaving again is summed; dust is not kept', () => {
    let list = depart(undefined, { name: ' raj ', phone: ' 9000000002 ', net: -50 });
    assert.deepEqual(list, [{ name: 'Raj', phone: '9000000002', net: -50 }]);
    list = depart(list, { name: 'Raj', phone: '9000000002', net: 20 });
    assert.deepEqual(list, [{ name: 'Raj', phone: '9000000002', net: -30 }]);
    list = depart(list, { name: 'Raj', phone: '9000000002', entityId: 7, net: 10 });
    assert.equal(list.length, 2);
    assert.equal(depart(list, { name: 'Dev', net: 0.004 }).length, 2);
});

test('the removal note and the minimum-players refusal', () => {
    assert.equal(departureNote(120.5), ' They leave ₹120.5 up and stay in Final Owings.');
    assert.equal(departureNote(-80), ' They leave ₹80 down and stay in Final Owings.');
    assert.equal(departureNote(0.004), '');
    assert.equal(tooFewToRemove(2), 'Keep at least 2 players at the table; use Final Owings to settle up.');
    assert.equal(tooFewToRemove(1), 'Keep at least 1 player at the table; use Final Owings to settle up.');
});

const tpPlayer = (id: number, balance: number) => ({ id, name: `P${id}`, balance, phoneNumber: String(9000000000 + id), isTakingBreak: false });

test('teen patti: a removed player stays in the settlement; at two players removal is refused', () => {
    const s = TP.newGame([tpPlayer(1, 100), tpPlayer(2, -60), tpPlayer(3, -40)]);
    const { state } = runStep(s, (x, io) => TP.removePlayer(x, 3, io));
    assert.deepEqual(state.departed, [{ name: 'P3', phone: '9000000003', entityId: undefined, net: -40 }]);
    assert.equal(state.messages.at(-1), 'Player P3 removed from the game. They leave ₹40 down and stay in Final Owings.');
    const settled = teenPattiSettlement(state);
    assert.deepEqual(settled.transactions.map(t => [t.from, t.to, t.amount]), [['P3', 'P1', 40], ['P2', 'P1', 60]]);
    assert.equal(playerNets(settled.people).length, 3);
    const refused = runStep(state, (x, io) => TP.removePlayer(x, 2, io)).state;
    assert.equal(refused.players.length, 2);
    assert.equal(refused.messages.at(-1), 'ERROR: Keep at least 2 players at the table; use Final Owings to settle up.');
});

test('teen patti: departures survive the round reset', () => {
    let s = runStep(TP.newGame([tpPlayer(1, 0), tpPlayer(2, 0), tpPlayer(3, 25)]), (x, io) => TP.removePlayer(x, 3, io)).state;
    s = runStep(s, (x, io) => TP.startRound(x, 0, 10, io)).state;
    s = runStep(s, (x, io) => TP.endRound(x, 1, io)).state;
    assert.equal(s.departed?.[0]?.net, 25);
});

test('poker: the leaver\'s stack minus buy-in is kept, and departures survive a fold-out', () => {
    let s = PK.newPokerGame([1, 2, 3].map(i => ({ name: `P${i}`, stack: 100, phoneNumber: String(9000000000 + i) })), { sb: 5, bb: 10 }, undefined, 0);
    s = { ...s, players: s.players.map(p => (p.id === 3 ? { ...p, stack: 160 } : p.id === 1 ? { ...p, stack: 40 } : p)) };
    const { state } = runStep(s, (x, io) => PK.removePlayer(x, 3, io));
    assert.deepEqual(state.departed, [{ name: 'P3', phone: '9000000003', net: 60 }]);
    assert.equal(state.messages.at(-1), 'Player P3 has been removed from the game. They leave ₹60 up and stay in Final Owings.');
    assert.deepEqual(pokerSettlement(state).transactions.map(t => [t.from, t.to, t.amount]), [['P1', 'P3', 60]]);
    let hand = runStep(state, (x, io) => PK.startNewHand(x, io)).state;
    hand = runStep(hand, (x, io) => PK.playerAction(x, 'fold', 0, io)).state;
    assert.deepEqual(hand.departed, state.departed);
});

test('blackjack: a leaver\'s placed bets count in their result', () => {
    let s = runStep(BJ.newBlackjackGame([1, 2].map(i => ({ name: `P${i}`, stack: 500, phoneNumber: String(9000000000 + i), numHands: 1 }))), (x, io) => BJ.unlockAllBets(x, io)).state;
    s = runStep(s, (x, io) => BJ.placeBet(x, 2, 0, 100, io)).state;
    const { state } = runStep(s, (x, io) => BJ.removePlayer(x, 2, io));
    assert.deepEqual(state.departed, []); // 400 in the stack + the 100 bet = the buy-in: nothing to keep
    const lone = runStep(state, (x, io) => BJ.removePlayer(x, 1, io)).state;
    assert.equal(lone.messages.at(-1), 'Keep at least 1 player at the table; use Final Owings to settle up.');
    assert.equal(blackjackSettlement(state).transactions.length, 0);
});
