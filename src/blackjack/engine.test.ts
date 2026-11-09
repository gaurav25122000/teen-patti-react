import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { BlackjackGameState, BlackjackPlayer, HandStatus } from './types/blackjackGameTypes.ts';
import { blackjackSettlement } from '../utils/gameSettlement.ts';
import { settlementProblem } from '../utils/settlementCheck.ts';

const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let clock = 0;
const go = (s: BlackjackGameState, fn: (s: BlackjackGameState, io: Io) => BlackjackGameState) => runStep(s, fn, () => ++clock).state;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const open = (h: BlackjackPlayer['hands'][number]) => (h.status === 'playing' || h.status === 'stand' ? h.wager : 0) + (h.insurance && !h.insuranceResult ? h.insurance : 0);
// Chips a player has, counting bets still on the table.
const chipsWithBets = (p: BlackjackPlayer) => p.stack + sum(p.hands.map(open));

const randomAction = (s: BlackjackGameState, r: () => number): BlackjackGameState => {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    if (s.gameStage === 'betting') {
        const choice = r();
        if (!s.isBettingLocked && choice < 0.45) {
            const p = pick(s.players);
            return go(s, (x, io) => E.placeBet(x, p.id, Math.floor(r() * p.initialHandsCount), s.minBet + Math.floor(r() * 100), io));
        }
        if (choice < 0.6) return go(s, (x, io) => E.startRound(x, io));
        if (choice < 0.68) return go(s, (x, io) => E.unlockAllBets(x, io));
        if (choice < 0.74) {
            const id = Math.max(...s.players.map(p => p.id)) + 1;
            return go(s, (x, io) => E.addPlayer(x, `P${id}`, 100 + Math.floor(r() * 900), String(9000000000 + id), 1 + Math.floor(r() * 2), io));
        }
        if (choice < 0.8 && s.players.length > 1) return go(s, (x, io) => E.removePlayer(x, pick(x.players).id, io));
        if (choice < 0.88) return go(s, (x, io) => E.addChipsToPlayer(x, pick(x.players).id, 50 + Math.floor(r() * 300), io));
        if (choice < 0.94) return go(s, (x, io) => E.togglePlayerBreak(x, pick(x.players).id, io));
        return go(s, (x, io) => E.updatePlayerHandCount(x, pick(x.players).id, 1 + Math.floor(r() * 3), io));
    }
    if (s.gameStage === 'player-turn') {
        return go(s, (x, io) => E.playerAction(x, pick<E.HandAction>(['hit', 'stand', 'stand', 'double', 'split', 'surrender', 'insurance']), io));
    }
    const insured = s.players.some(p => p.hands.some(h => h.insurance && !h.insuranceResult));
    if (insured && r() < 0.3) return go(s, (x, io) => E.settleInsurance(x, r() < 0.5, io));
    const unsettled = s.players.flatMap(p => p.hands.filter(h => h.status === 'playing' || h.status === 'stand').map(h => ({ p, h })));
    if (unsettled.length === 0) return go(s, (x, io) => E.settleInsurance(x, r() < 0.5, io));
    const { p, h } = pick(unsettled);
    return go(s, (x, io) => E.setHandStatus(x, p.id, h.id, pick<HandStatus>(['win', 'lose', 'push', 'blackjack', 'busted']), io));
};

test('blackjack chips plus the house are conserved over 50 seeded random games of 200 actions, and settle exactly', () => {
    for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const players = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => ({ name: `P${i + 1}`, stack: 200 + Math.floor(r() * 800), phoneNumber: String(9000000001 + i), numHands: 1 + Math.floor(r() * 2) }));
        let s = E.newBlackjackGame(players);
        if (r() < 0.5) s = { ...s, blackjackPayout: '6to5' };
        let removedNet = 0; // a removed player's result leaves the table with them
        for (let step = 0; step < 200; step++) {
            const before = s;
            s = randomAction(s, r);
            before.players.filter(p => !s.players.some(q => q.id === p.id)).forEach(p => { removedNet += chipsWithBets(p) - p.totalBuyIn; });
            const where = `seed ${seed}, step ${step}`;
            assert.ok(Math.abs(sum(s.players.map(chipsWithBets)) + s.dealerNet + removedNet - sum(s.players.map(p => p.totalBuyIn))) < 1e-9, `${where}: chips not conserved`);
            const settled = blackjackSettlement(s);
            assert.equal(settlementProblem(settled.parties, settled.transactions, settled.offBy), null, where);
            assert.ok(Math.abs(settled.offBy + removedNet) < 0.005, `${where}: off by ${settled.offBy}`);
        }
    }
});

test('a new bet on a hand replaces the old one, which goes back to the stack', () => {
    let s = go(E.newBlackjackGame([{ name: 'Asha', stack: 500, phoneNumber: '9000000001', numHands: 1 }]), (x, io) => E.unlockAllBets(x, io));
    s = go(s, (x, io) => E.placeBet(x, 1, 0, 100, io));
    s = go(s, (x, io) => E.placeBet(x, 1, 0, 50, io));
    assert.equal(s.players[0].stack, 450);
    assert.equal(s.players[0].hands[0].bet, 50);
    assert.equal(go(s, (x, io) => E.placeBet(x, 1, 0, 500, io)).players[0].hands[0].bet, 500);
});

test('a player who bet their whole stack still plays the round', () => {
    let s = go(E.newBlackjackGame([{ name: 'Asha', stack: 100, phoneNumber: '9000000001', numHands: 1 }]), (x, io) => E.unlockAllBets(x, io));
    s = go(s, (x, io) => E.placeBet(x, 1, 0, 100, io));
    s = go(s, (x, io) => E.startRound(x, io));
    assert.equal(s.gameStage, 'player-turn');
    assert.equal(s.players[0].hands[0].bet, 100);
});

test('betting on a later hand leaves no gap before it', () => {
    let s = go(E.newBlackjackGame([{ name: 'Asha', stack: 500, phoneNumber: '9000000001', numHands: 1 }]), (x, io) => E.unlockAllBets(x, io));
    s = go(s, (x, io) => E.updatePlayerHandCount(x, 1, 3, io));
    s = go(s, (x, io) => E.placeBet(x, 1, 2, 20, io));
    assert.deepEqual(s.players[0].hands.map(h => h.bet), [0, 0, 20]);
});
