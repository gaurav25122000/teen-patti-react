import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { BlackjackGameState } from './types/blackjackGameTypes.ts';
import type { BlackjackSettings } from '../utils/gameSettings.ts';
import { blackjackSettlement } from '../utils/gameSettlement.ts';

const BASE: BlackjackSettings = { blackjackPayout: '3to2', allowSurrender: true, minBet: 10, maxBet: 1000, insurance: true, defaultHands: 1, sideBets: false };
const table = (names: string[], settings: Partial<BlackjackSettings> = {}) =>
    E.newBlackjackGame(names.map((name, i) => ({ name, stack: 1000, phoneNumber: String(9000000001 + i), numHands: 1 })), { ...BASE, ...settings });
const go = (s: BlackjackGameState, fn: (s: BlackjackGameState, io: Io) => BlackjackGameState) => runStep(s, fn).state;
const newLines = (before: BlackjackGameState, after: BlackjackGameState) => after.messages.slice(before.messages.length);
const unlock = (s: BlackjackGameState) => go(s, (x, io) => E.unlockAllBets(x, io));
const bet = (s: BlackjackGameState, id: number, amount: number) => go(s, (x, io) => E.placeBet(x, id, 0, amount, io));
const side = (s: BlackjackGameState, id: number, kind: E.SideKind, amount: number) => go(s, (x, io) => E.placeSideBet(x, id, 0, kind, amount, io));
const deal = (s: BlackjackGameState) => go(s, (x, io) => E.startRound(x, io));
const act = (s: BlackjackGameState, action: E.HandAction) => go(s, (x, io) => E.playerAction(x, action, io));
const mark = (s: BlackjackGameState, id: number, status: Parameters<typeof E.setHandStatus>[3]) =>
    runStep(s, (x, io) => E.setHandStatus(x, id, x.players.find(p => p.id === id)!.hands[0].id, status, io));

test('insurance can be turned off', () => {
    const s = deal(table(['Asha'], { insurance: false }));
    assert.deepEqual(newLines(s, act(s, 'insurance')), ['Insurance is off at this table.']);
});

test('side bets: need the main bet, capped by the table max, replace the old one, and count as chips on the table', () => {
    let s = unlock(table(['Asha'], { sideBets: true }));
    assert.deepEqual(newLines(s, side(s, 1, 'pp', 10)), ["Place the hand's bet first."]);
    s = bet(s, 1, 100);
    assert.deepEqual(newLines(s, side(s, 1, 'pp', 1001)), ['Side bets can be at most ₹1000.']);
    s = side(side(s, 1, 'pp', 30), 1, 'pp', 10);
    s = side(s, 1, 't3', 20);
    assert.equal(s.players[0].stack, 870);
    assert.equal(E.chipsWithBets(s.players[0]), 1000);
    assert.equal(side(s, 1, 't3', 0).players[0].stack, 890);
    assert.equal(unlock(s).players[0].stack, 1000);
    assert.equal(go(s, (x, io) => E.applySettings(x, { ...BASE, sideBets: false }, io)).players[0].stack, 900);
});

test('side bets settle against the house, and the round waits for them', () => {
    let s = side(side(bet(unlock(table(['Asha'], { sideBets: true })), 1, 100), 1, 'pp', 10), 1, 't3', 20);
    s = act(deal(s), 'stand');
    s = mark(s, 1, 'win').state;
    assert.equal(s.gameStage, 'dealer-turn');
    const hand = s.players[0].hands[0].id;
    s = go(s, (x, io) => E.settleSideBet(x, 1, hand, 'pp', 'coloured', io));
    assert.equal(s.messages.at(-1), 'Asha (Hand 1) Perfect Pairs: coloured pair, wins ₹120.');
    const { state, records } = runStep(s, (x, io) => E.settleSideBet(x, 1, hand, 't3', 'lose', io));
    assert.ok(state.messages.includes('Asha (Hand 1) 21+3 loses ₹20.'));
    assert.equal(state.gameStage, 'betting');
    assert.equal(state.players[0].stack, 1200);
    assert.equal(state.dealerNet, -200);
    assert.deepEqual(records, [{ phone: '9000000001', name: 'Asha', winnings: 200 }]);
});

test('the banker takes the house side, plays no hands, and the role rotates after N rounds', () => {
    let s = table(['Asha', 'Raj', 'Dev'], { bankerEvery: 2 });
    assert.equal(s.messages.at(-1), 'Asha is now the banker for 2 rounds.');
    assert.deepEqual(newLines(unlock(s), bet(unlock(s), 1, 50)), ['Asha is the banker this round.']);
    s = act(act(deal(s), 'stand'), 'stand'); // Raj and Dev auto-bet ₹10; Asha is skipped
    assert.deepEqual(s.players[0].hands, []);
    s = mark(s, 2, 'win').state;
    const end = mark(s, 3, 'blackjack');
    assert.equal(end.state.dealerNet, 0);
    assert.deepEqual(end.state.players.map(p => p.stack), [975, 1010, 1015]);
    assert.deepEqual(end.records.map(r => [r.name, r.winnings]), [['Raj', 10], ['Dev', 15], ['Asha', -25]]);
    let round2 = act(act(deal(end.state), 'stand'), 'stand');
    round2 = mark(round2, 2, 'lose').state;
    round2 = mark(round2, 3, 'lose').state;
    assert.equal(round2.bankerId, 2);
    assert.equal(round2.messages.at(-1), 'Raj is now the banker for 2 rounds.');
    assert.equal(blackjackSettlement(round2).offBy, 0);
});

test('rotation skips players on a break; a banker on a break stays the banker', () => {
    let s = go(table(['Asha', 'Raj', 'Dev'], { bankerEvery: 1 }), (x, io) => E.togglePlayerBreak(x, 2, io));
    s = go(s, (x, io) => E.togglePlayerBreak(x, 1, io)); // Asha, the banker, goes on a break
    assert.equal(s.bankerId, 1);
    s = act(deal(s), 'stand');
    s = mark(s, 3, 'push').state;
    assert.equal(s.bankerId, 3);
});

test('removing the banker passes the role to the next seat at once', () => {
    const s = table(['Asha', 'Raj', 'Dev'], { bankerEvery: 2 });
    assert.deepEqual(newLines(s, go(s, (x, io) => E.removePlayer(x, 1, io))), ['Player Asha has been removed.', 'Raj is now the banker for 2 rounds.']);
    assert.equal(go({ ...s, bankerId: 2 }, (x, io) => E.removePlayer(x, 2, io)).bankerId, 3);
    assert.equal(go({ ...s, bankerId: 3 }, (x, io) => E.removePlayer(x, 3, io)).bankerId, 1); // wraps to the first seat
});

test('turning the banker on keeps the house total, changing N restarts the count, turning it off only logs the setting', () => {
    let s = act(deal(table(['Asha', 'Raj'])), 'stand');
    s = act(s, 'stand');
    s = mark(mark(s, 1, 'lose').state, 2, 'lose').state;
    assert.equal(s.dealerNet, 20);
    const on = go(s, (x, io) => E.applySettings(x, { ...BASE, bankerEvery: 3 }, io));
    assert.deepEqual(newLines(s, on), ['Settings: banker every 3 rounds', 'Asha is now the banker for 3 rounds.']);
    assert.equal(on.dealerNet, 20);
    const changed = go({ ...on, bankerId: 2, bankerRounds: 2 }, (x, io) => E.applySettings(x, { ...BASE, bankerEvery: 5 }, io));
    assert.deepEqual(newLines(on, changed), ['Settings: banker every 5 rounds', 'Raj is now the banker for 5 rounds.']);
    assert.deepEqual([changed.bankerId, changed.bankerRounds], [2, 0]);
    const off = go(on, (x, io) => E.applySettings(x, BASE, io));
    assert.deepEqual(newLines(on, off), ['Settings: banker off']);
    assert.equal(off.bankerId, undefined);
    assert.deepEqual(newLines(on, go({ ...on, gameStage: 'dealer-turn' }, (x, io) => E.applySettings(x, BASE, io))), ['Settings can only change between rounds.']);
});

test('a locked repeat bet is brought within the current table limits', () => {
    const s = table(['Asha', 'Raj']);
    const tighter = go(s, (x, io) => E.applySettings(x, { ...BASE, minBet: 20, maxBet: 100 }, io));
    assert.deepEqual(deal(tighter).players.map(p => p.hands[0].bet), [20, 20]);
    const big = { ...tighter, players: tighter.players.map(p => ({ ...p, lastBets: [500] })) };
    assert.deepEqual(deal(big).players.map(p => [p.hands[0].bet, p.stack]), [[100, 900], [100, 900]]);
});

test('two splits in the same moment get distinct hands, and the round still reaches the dealer', () => {
    let s = deal(table(['Asha']));
    s = act(act(s, 'split'), 'split'); // the clock never moves in runStep
    const ids = s.players[0].hands.map(h => h.id);
    assert.equal(new Set(ids).size, 3);
    s = act(act(act(s, 'stand'), 'stand'), 'stand');
    assert.equal(s.gameStage, 'dealer-turn');
});

test('surrender can be turned off, with the same refusal as insurance', () => {
    const s = deal(table(['Asha'], { allowSurrender: false }));
    assert.deepEqual(newLines(s, act(s, 'surrender')), ['Surrender is off at this table.']);
});

// Steps that round money to whole paise, as the app does after every update.
const paid = (s: BlackjackGameState, fn: (s: BlackjackGameState, io: Io) => BlackjackGameState) => runStep(s, fn, () => 0, E.roundMoney);

test('blackjack pays 3:2 on the whole stake, doubled too; 6:5 to the paisa', () => {
    const doubled = mark(act(deal(table(['Asha'])), 'double'), 1, 'blackjack'); // ₹10 doubled to ₹20
    assert.equal(doubled.state.players[0].stack, 1030);
    assert.equal(doubled.state.dealerNet, -30);
    assert.deepEqual(doubled.records.map(r => r.winnings), [30]);
    assert.ok(doubled.state.messages.includes('Asha (Hand 1) has BLACKJACK! Wins ₹30'));
    const sixFive = act(deal(bet(unlock(table(['Asha'], { blackjackPayout: '6to5' })), 1, 12.34)), 'stand');
    const end = paid(sixFive, (x, io) => E.setHandStatus(x, 1, x.players[0].hands[0].id, 'blackjack', io)).state;
    assert.equal(end.players[0].stack, 1014.81);
    assert.equal(end.dealerNet, -14.81);
});

test("a settled hand is never paid twice, and nothing is marked before the dealer's turn", () => {
    const s = mark(act(act(deal(table(['Asha', 'Raj'])), 'stand'), 'stand'), 1, 'win').state;
    assert.equal(s.gameStage, 'dealer-turn');
    assert.equal(go(s, (x, io) => E.setHandStatus(x, 1, x.players[0].hands[0].id, 'lose', io)), s);
    const early = deal(table(['Asha']));
    assert.equal(go(early, (x, io) => E.setHandStatus(x, 1, x.players[0].hands[0].id, 'win', io)), early);
});

test('repeat bets follow each dealt hand after a split', () => {
    let s = unlock(E.newBlackjackGame([{ name: 'Asha', stack: 1000, phoneNumber: '9000000001', numHands: 2 }], BASE));
    s = go(go(s, (x, io) => E.placeBet(x, 1, 0, 20, io)), (x, io) => E.placeBet(x, 1, 1, 50, io));
    s = act(act(act(act(deal(s), 'split'), 'stand'), 'stand'), 'stand'); // Hand 1, its split, Hand 2
    for (const hand of s.players[0].hands) s = go(s, (x, io) => E.setHandStatus(x, 1, hand.id, 'push', io));
    assert.equal(s.gameStage, 'betting');
    assert.deepEqual(s.players[0].lastBets, [20, 50]);
});

test('insurance and surrender halves are whole paise, and the books still balance', () => {
    const s = bet(unlock(table(['Asha'])), 1, 12.35);
    assert.equal(act(deal(s), 'insurance').players[0].hands[0].insurance, 6.18); // rounded where it is worked out, not later
    const end = paid(deal(s), (x, io) => E.playerAction(x, 'surrender', io)).state;
    assert.equal(end.players[0].stack, 993.83);
    assert.equal(end.dealerNet, 6.17);
});
