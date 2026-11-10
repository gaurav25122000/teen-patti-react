import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './teenPattiEngine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { GameState, Player } from '../types/gameTypes.ts';
import { betRefusal, bootRefusal, nextBoot } from '../utils/teenPattiRules.ts';
import { teenPattiSettlement } from '../utils/gameSettlement.ts';
import { settlementProblem } from '../utils/settlementCheck.ts';
import { toTitleCase } from '../utils/formatters.ts';

// Small seeded PRNG so every failure replays.
const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const player = (id: number, balance: number): Player => ({ id, name: `P${id}`, balance, phoneNumber: String(9000000000 + id), isTakingBreak: false });
const go = (s: GameState, fn: (s: GameState, io: Io) => GameState) => runStep(s, fn).state;
// Money at the table, counting players who left (their balance stays in the settlement).
const money = (s: GameState) => s.players.reduce((sum, p) => sum + p.balance, 0) + s.potAmount + (s.departed ?? []).reduce((sum, d) => sum + d.net, 0);

// One random legal action, as the screens allow it; returns the change to the money at the table.
const randomAction = (s: GameState, r: () => number): { next: GameState; added: number } => {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const amount = (max: number) => 1 + Math.floor(r() * max);
    if (!s.roundActive) {
        const choice = r();
        if (choice < 0.55) {
            const boot = amount(40);
            if (bootRefusal(s, nextBoot(s, boot))) return { next: s, added: 0 };
            return { next: go(s, (x, io) => E.startRound(x, Math.floor(r() * x.players.length), boot, io)), added: 0 };
        }
        if (choice < 0.65) {
            const balance = Math.floor(r() * 200) - 100;
            const id = Math.max(...s.players.map(p => p.id)) + 1;
            return { next: go(s, (x, io) => E.addPlayer(x, `P${id}`, balance, String(9000000000 + id), io)), added: balance };
        }
        if (choice < 0.72 && s.players.length > 2) {
            return { next: go(s, (x, io) => E.removePlayer(x, pick(s.players).id, io)), added: 0 };
        }
        if (choice < 0.8) return { next: go(s, (x, io) => E.deductAndDistribute(x, pick(s.players).id, amount(60), io)), added: 0 };
        if (choice < 0.9) return { next: go(s, (x, io) => E.togglePlayerBreak(x, pick(s.players).id, io)), added: 0 };
        const settings = {
            potLimit: r() < 0.5 ? amount(400) + 50 : undefined, maxBlindTurns: r() < 0.5 ? amount(4) : undefined, maxChaal: r() < 0.5 ? amount(100) + 20 : undefined,
            bootRiseEvery: r() < 0.3 ? amount(3) : undefined, bootRiseStep: undefined as number | undefined,
        };
        settings.bootRiseStep = settings.bootRiseEvery ? amount(20) : undefined;
        return { next: go(s, (x, io) => E.applySettings(x, settings, io)), added: 0 };
    }
    const { currentPlayer, precedingPlayer, activePlayers } = E.derivePlayers(s);
    if (!currentPlayer) return { next: s, added: 0 };
    const blind = s.blindPlayerIds.has(currentPlayer.id);
    const refused = (kind: 'blind' | 'chaal' | 'show', amt: number) =>
        betRefusal(s, kind, amt, toTitleCase(currentPlayer.name), s.blindTurns?.[currentPlayer.id] ?? 0, blind) !== null;
    const choice = r();
    if (choice < 0.35) {
        const amt = blind ? (r() < 0.5 ? s.currentStake : s.currentStake * 2) : s.currentStake * 2 + Math.floor(r() * 3) * 10;
        if (refused(blind ? 'blind' : 'chaal', amt)) return { next: s, added: 0 };
        return { next: go(s, x => (blind ? E.playBlind(x, amt > x.currentStake, amt) : E.betChaal(x, amt))), added: 0 };
    }
    if (choice < 0.5 && blind) return { next: go(s, x => E.seeCards(x)), added: 0 };
    if (choice < 0.65) return { next: go(s, (x, io) => E.fold(x, io)), added: 0 };
    if (choice < 0.85 && precedingPlayer) {
        const cost = blind ? s.currentStake : s.currentStake * 2;
        if (refused('show', cost)) return { next: s, added: 0 };
        const loser = r() < 0.5 ? currentPlayer.id : precedingPlayer.id;
        return { next: go(go(s, x => E.requestShow(x, cost)), (x, io) => E.resolveShow(x, loser, io)), added: 0 };
    }
    return { next: go(s, (x, io) => E.endRound(x, pick(activePlayers).id, io)), added: 0 };
};

test('teen patti money is conserved over 50 seeded random games of 200 actions, and settles exactly', () => {
    for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const start = Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => player(i + 1, Math.floor(r() * 100) - 50));
        let s = E.newGame(start);
        let expected = money(s);
        for (let step = 0; step < 200; step++) {
            const { next, added } = randomAction(s, r);
            s = next;
            expected += added;
            const where = `seed ${seed}, step ${step}`;
            assert.ok(Math.abs(money(s) - expected) < 1e-9, `${where}: money ${money(s)} != ${expected}`);
            assert.equal(s.potAmount, [...s.roundContributions.values()].reduce((a, b) => a + b, 0), `${where}: pot != contributions`);
            if (!s.roundActive) assert.equal(s.potAmount, 0, `${where}: pot left between rounds`);
            const settled = teenPattiSettlement(s);
            assert.equal(settlementProblem(settled.parties, settled.transactions, settled.offBy), null, where);
        }
    }
});

test('a fold that leaves one player ends the round and pays them the pot', () => {
    let s = E.newGame([player(1, 0), player(2, 0)]);
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    const { state, records } = runStep(s, (x, io) => E.fold(x, io));
    assert.equal(state.roundActive, false);
    assert.deepEqual(state.players.map(p => p.balance), [-10, 10]);
    assert.deepEqual(records, [{ phone: '9000000001', name: 'P1', winnings: -10 }, { phone: '9000000002', name: 'P2', winnings: 10 }]);
    assert.deepEqual(state.messages.slice(-4), ['P1 folds.', 'P2 is the last player remaining.', '--- ROUND OVER ---', 'Congratulations! P2 won the pot of ₹20']);
});

test('a round reset keeps groups, rules, the carried-in flag and the start time', () => {
    let s = { ...E.newGame([player(1, 50), player(2, -50)], { potLimit: 500 }, 1234), entities: [{ id: 7, name: 'Team' }] };
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    s = go(s, (x, io) => E.endRound(x, 1, io));
    assert.deepEqual(s.entities, [{ id: 7, name: 'Team' }]);
    assert.equal(s.potLimit, 500);
    assert.equal(s.carriedIn, true);
    assert.equal(s.startedAt, 1234);
});

test('round stats are keyed by party, so a namesake joining later changes nothing', () => {
    let s = E.newGame([player(1, 0), player(2, 0)]);
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    s = go(s, (x, io) => E.endRound(x, 1, io));
    assert.deepEqual(s.stats?.wins, { '9000000001|P1': 1 });
    assert.deepEqual(s.stats?.biggest, { key: '9000000001|P1', amount: 20 });
    assert.equal(s.stats?.names['9000000001|P1'], 'P1');
});

test('joining with a balance marks the game carried in; joining at zero does not', () => {
    const s = E.newGame([player(1, 0), player(2, 0)]);
    assert.equal(s.carriedIn, false);
    assert.equal(go(s, (x, io) => E.addPlayer(x, 'Raj', 0, '9000000009', io)).carriedIn, false);
    assert.equal(go(s, (x, io) => E.addPlayer(x, 'Raj', 25, '9000000009', io)).carriedIn, true);
});

test('deduct and distribute keeps balances in whole paise', () => {
    const s = go(E.newGame([player(1, 0), player(2, 0), player(3, 0), player(4, 0)]), (x, io) => E.deductAndDistribute(x, 1, 10.004, io));
    assert.deepEqual(s.players.map(p => p.balance), [-10, 4, 3, 3]);
});

test('settings change only between rounds, logging what changed', () => {
    let s = E.newGame([player(1, 0), player(2, 0)]);
    s = runStep(s, (x, io) => E.applySettings(x, { potLimit: 500, turnTimer: 30 }, io)).state;
    assert.equal(s.messages.at(-1), 'Settings: pot limit ₹500, turn timer 30 s');
    assert.equal(s.potLimit, 500);
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    const refused = runStep(s, (x, io) => E.applySettings(x, { potLimit: 900 }, io)).state;
    assert.equal(refused.potLimit, 500);
    assert.equal(refused.messages.at(-1), 'ERROR: Settings can only change between rounds.');
});

test('the boot rises on schedule and is logged; the dealer sits before the starter, skipping breaks', () => {
    let s = E.newGame([player(1, 0), player(2, 0), player(3, 0)], { bootRiseEvery: 1, bootRiseStep: 5 });
    s = go(s, (x, io) => E.togglePlayerBreak(x, 3, io));
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    assert.equal(s.potAmount, 20);
    assert.equal(s.dealerId, 2);
    s = go(s, (x, io) => E.endRound(x, 1, io));
    s = go(s, (x, io) => E.startRound(x, 1, 10, io));
    assert.equal(s.potAmount, 30);
    assert.equal(s.messages.includes('Boot is now ₹15.'), true);
    assert.equal(s.dealerId, 1);
});

test('an older save that cannot tell about carried-in balances stays unknown through round ends', () => {
    let s: GameState = { ...E.newGame([player(1, 0), player(2, 0)]), carriedIn: undefined };
    s = go(s, (x, io) => E.startRound(x, 0, 10, io));
    s = go(s, (x, io) => E.endRound(x, 1, io));
    assert.equal(s.carriedIn, undefined);
});
