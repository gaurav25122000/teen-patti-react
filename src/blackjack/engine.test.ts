import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { BlackjackGameState, BlackjackPlayer, HandStatus, SideResult } from './types/blackjackGameTypes.ts';
import type { BlackjackSettings } from '../utils/gameSettings.ts';
import { blackjackSettlement } from '../utils/gameSettlement.ts';
import { everyModeProblem } from '../utils/settlementCheck.ts';

const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let clock = 0;
let lastRecords: ReturnType<typeof runStep>['records'] = []; // winnings rows of the latest step
const go = (s: BlackjackGameState, fn: (s: BlackjackGameState, io: Io) => BlackjackGameState) => {
    const out = runStep(s, fn, () => ++clock);
    lastRecords = out.records;
    return out.state;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const open = (h: BlackjackPlayer['hands'][number]) => (h.status === 'playing' || h.status === 'stand' ? h.wager : 0) + (h.insurance && !h.insuranceResult ? h.insurance : 0)
    + (h.pp && !h.ppResult ? h.pp : 0) + (h.t3 && !h.t3Result ? h.t3 : 0);

const randomSettings = (r: () => number): BlackjackSettings => ({
    blackjackPayout: r() < 0.5 ? '3to2' : '6to5', allowSurrender: r() < 0.7, minBet: 10, maxBet: 1000,
    insurance: r() < 0.7, defaultHands: 1, bankerEvery: r() < 0.5 ? 1 + Math.floor(r() * 3) : undefined, sideBets: r() < 0.6,
});
const SIDE_RESULTS: Record<'pp' | 't3', SideResult[]> = { pp: ['lose', 'mixed', 'coloured', 'perfect'], t3: ['lose', 'flush', 'straight', 'trips', 'straight-flush', 'suited-trips'] };
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
        if (choice < 0.55) {
            const p = pick(s.players);
            const kind = r() < 0.5 ? 'pp' : 't3';
            return go(s, (x, io) => E.placeSideBet(x, p.id, Math.floor(r() * Math.max(1, p.hands.length)), kind, Math.floor(r() * 60), io));
        }
        if (choice < 0.57) return go(s, (x, io) => E.applySettings(x, randomSettings(r), io));
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
    const openSide = s.players.flatMap(p => p.hands.flatMap(h => (['pp', 't3'] as const).filter(k => h[k] && !h[k === 'pp' ? 'ppResult' : 't3Result']).map(kind => ({ p, h, kind }))));
    if (openSide.length && r() < 0.3) {
        const { p, h, kind } = pick(openSide);
        return go(s, (x, io) => E.settleSideBet(x, p.id, h.id, kind, pick(SIDE_RESULTS[kind]), io));
    }
    if (s.gameStage === 'player-turn') {
        return go(s, (x, io) => E.playerAction(x, pick<E.HandAction>(['hit', 'stand', 'stand', 'double', 'split', 'surrender', 'insurance']), io));
    }
    const insured = s.players.some(p => p.hands.some(h => h.insurance && !h.insuranceResult));
    if (insured && r() < 0.3) return go(s, (x, io) => E.settleInsurance(x, r() < 0.5, io));
    const unsettled = s.players.flatMap(p => p.hands.filter(h => h.status === 'playing' || h.status === 'stand').map(h => ({ p, h })));
    if (unsettled.length === 0) {
        if (openSide.length) {
            const { p, h, kind } = pick(openSide);
            return go(s, (x, io) => E.settleSideBet(x, p.id, h.id, kind, pick(SIDE_RESULTS[kind]), io));
        }
        return go(s, (x, io) => E.settleInsurance(x, r() < 0.5, io));
    }
    const { p, h } = pick(unsettled);
    return go(s, (x, io) => E.setHandStatus(x, p.id, h.id, pick<HandStatus>(['win', 'lose', 'push', 'blackjack', 'busted']), io));
};

test('blackjack chips plus the house are conserved over 50 seeded random games of 200 actions, and settle exactly', () => {
    for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const players = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => ({ name: `P${i + 1}`, stack: 200 + Math.floor(r() * 800), phoneNumber: String(9000000001 + i), numHands: 1 + Math.floor(r() * 2) }));
        let s = E.newBlackjackGame(players, randomSettings(r));
        for (let step = 0; step < 200; step++) {
            const before = s;
            lastRecords = [];
            s = randomAction(s, r);
            const where = `seed ${seed}, step ${step}`;
            const banker = s.players.find(p => p.id === s.bankerId);
            assert.ok(!banker || banker.hands.length === 0, `${where}: the banker has hands`);
            if (before.bankerId !== undefined && s.bankerId !== undefined) assert.equal(s.dealerNet, before.dealerNet, `${where}: the house moved while a player banks`);
            if (before.bankerId !== undefined && before.gameStage !== 'betting' && s.gameStage === 'betting' && s.players.length === before.players.length) {
                assert.ok(Math.abs(sum(lastRecords.map(x => x.winnings))) < 1e-9, `${where}: the banker's record isn't the other side of the table`);
            }
            const leftWith = sum((s.departed ?? []).map(d => d.net)); // players who left stay settled
            assert.ok(Math.abs(sum(s.players.map(chipsWithBets)) + s.dealerNet + leftWith - sum(s.players.map(p => p.totalBuyIn))) < 1e-9, `${where}: chips not conserved`);
            const settled = blackjackSettlement(s);
            assert.equal(everyModeProblem(settled), null, where);
            assert.ok(Math.abs(settled.offBy) < 0.005, `${where}: off by ${settled.offBy}`);
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

test('bets of a player on a break go back at the deal, whether the bet or the break came first', () => {
    const two = [{ name: 'Asha', stack: 500, phoneNumber: '9000000001', numHands: 1 }, { name: 'Raj', stack: 500, phoneNumber: '9000000002', numHands: 1 }];
    const unlocked = go(E.newBlackjackGame(two), (x, io) => E.unlockAllBets(x, io));
    const withBets = (s: BlackjackGameState) => go(go(s, (x, io) => E.placeBet(x, 1, 0, 50, io)), (x, io) => E.placeBet(x, 2, 0, 80, io));
    const betThenBreak = go(withBets(unlocked), (x, io) => E.togglePlayerBreak(x, 2, io));
    const breakThenBet = withBets(go(unlocked, (x, io) => E.togglePlayerBreak(x, 2, io)));
    for (const s of [betThenBreak, breakThenBet]) {
        const dealt = go(s, (x, io) => E.startRound(x, io));
        assert.equal(dealt.gameStage, 'player-turn');
        assert.equal(dealt.players[1].stack, 500);
        assert.deepEqual(dealt.players[1].hands, []);
    }
});
