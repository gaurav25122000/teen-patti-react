import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { PokerGameState } from './types/pokerGameTypes.ts';
import { pokerSettlement } from '../utils/gameSettlement.ts';
import { settlementProblem } from '../utils/settlementCheck.ts';

const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const go = (s: PokerGameState, fn: (s: PokerGameState, io: Io) => PokerGameState) => runStep(s, fn).state;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// One random legal action, as the screens allow it.
const randomAction = (s: PokerGameState, r: () => number): PokerGameState => {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    if (s.gameStage === 'pre-deal') {
        const choice = r();
        if (choice < 0.6) return go(s, (x, io) => E.startNewHand(x, io));
        if (choice < 0.68) {
            const id = Math.max(...s.players.map(p => p.id)) + 1;
            return go(s, (x, io) => E.addPlayer(x, `P${id}`, 100 + Math.floor(r() * 900), String(9000000000 + id), io));
        }
        if (choice < 0.74 && s.players.length > 2) return go(s, (x, io) => E.removePlayer(x, pick(x.players).id, io));
        if (choice < 0.84) return go(s, (x, io) => E.addChipsToPlayer(x, pick(x.players).id, 50 + Math.floor(r() * 500), io));
        if (choice < 0.92) return go(s, (x, io) => E.togglePlayerBreak(x, pick(x.players).id, io));
        return go(s, (x, io) => E.applyStreakWinnings(x, pick(x.players).id, 10 + Math.floor(r() * 50), io));
    }
    if (s.gameStage === 'showdown') {
        const eligible = [...s.pot[0].eligiblePlayers];
        const winners = eligible.length === 1 ? eligible : eligible.filter(() => r() < 0.5);
        return go(s, (x, io) => E.awardPot(x, 0, winners.length ? winners : [pick(eligible)], io));
    }
    const p = s.players[s.activePlayerIndex];
    const canCheck = p.roundBet >= s.currentBet;
    const minTotal = s.currentBet > 0 ? s.currentBet + (s.lastRaiseAmount || s.bigBlindAmount) : s.bigBlindAmount;
    const maxTotal = p.roundBet + p.stack;
    const choice = r();
    if (choice < 0.15) return go(s, (x, io) => E.playerAction(x, 'fold', 0, io));
    if (choice < 0.55) return go(s, (x, io) => E.playerAction(x, canCheck ? 'check' : 'call', 0, io));
    if (choice < 0.85 && !p.canOnlyCall && minTotal <= maxTotal) {
        const amount = minTotal + Math.floor(r() * (maxTotal - minTotal + 1));
        return go(s, (x, io) => E.playerAction(x, s.currentBet > 0 ? 'raise' : 'bet', amount, io));
    }
    return go(s, (x, io) => E.playerAction(x, p.canOnlyCall ? 'call' : 'all-in', 0, io));
};

test('poker chips are conserved over 50 seeded random games of 200 actions, and settle exactly', () => {
    for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const players = Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => ({ name: `P${i + 1}`, stack: 200 + Math.floor(r() * 800), phoneNumber: String(9000000001 + i) }));
        let s = E.newPokerGame(players, { sb: 5, bb: 10 }, undefined, 0);
        for (let step = 0; step < 200; step++) {
            s = randomAction(s, r);
            const where = `seed ${seed}, step ${step}`;
            const stacks = sum(s.players.map(p => p.stack));
            const inPot = sum(s.players.map(p => p.totalPotContribution - p.roundWinnings));
            const leftWith = sum((s.departed ?? []).map(d => d.net)); // players who left stay settled
            assert.equal(stacks + inPot + leftWith, sum(s.players.map(p => p.totalBuyIn)), `${where}: chips not conserved`);
            if (s.gameStage === 'showdown') {
                assert.equal(sum(s.pot.map(p => p.amount)) + sum(s.players.map(p => p.roundWinnings)), sum(s.players.map(p => p.totalPotContribution)), `${where}: pots`);
            }
            assert.ok(s.players.every(p => p.totalPotContribution >= 0), `${where}: negative contribution`);
            const settled = pokerSettlement(s);
            assert.equal(settlementProblem(settled.parties, settled.transactions, settled.offBy), null, where);
            assert.ok(Math.abs(settled.offBy) < 0.005, `${where}: off by ${settled.offBy}`);
        }
    }
});

test('a fold-out pays the whole pot to the last player and records each phone', () => {
    let s = E.newPokerGame([{ name: 'Asha', stack: 100, phoneNumber: '9000000001' }, { name: 'Raj', stack: 100, phoneNumber: '9000000002' }], { sb: 5, bb: 10 }, undefined, 0);
    s = go(s, (x, io) => E.startNewHand(x, io)); // Asha deals and posts the big blind; Raj posts the small and acts
    assert.equal(s.players[s.activePlayerIndex].name, 'Raj');
    const { state, records } = runStep(s, (x, io) => E.playerAction(x, 'fold', 0, io));
    assert.equal(state.gameStage, 'pre-deal');
    assert.deepEqual(state.players.map(p => p.stack), [105, 95]);
    assert.deepEqual(records, [{ phone: '9000000001', name: 'Asha', winnings: 5 }, { phone: '9000000002', name: 'Raj', winnings: -5 }]);
});
