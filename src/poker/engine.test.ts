import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { PokerGameState } from './types/pokerGameTypes.ts';
import { pokerSettlement } from '../utils/gameSettlement.ts';
import { everyModeProblem } from '../utils/settlementCheck.ts';
import type { PokerSettings } from '../utils/gameSettings.ts';
import { poolPaise } from './tournament.ts';
import { paise } from '../utils/money.ts';

const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let clock = 0; // advanced a minute per simulated action, so blind levels rise
let lastRecords: ReturnType<typeof runStep>['records'] = []; // winnings rows of the latest step
const go = (s: PokerGameState, fn: (s: PokerGameState, io: Io) => PokerGameState) => {
    const out = runStep(s, fn, () => clock);
    lastRecords = out.records;
    return out.state;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Random table settings: each rule on about half the time.
const randomSettings = (r: () => number, tournament: boolean): PokerSettings => {
    const maybe = <T,>(p: number, v: T) => (r() < p ? v : undefined);
    const bomb = r() < 0.4;
    const addOn = r() < 0.4;
    return {
        smallBlindAmount: 5, bigBlindAmount: 10,
        levelMinutes: maybe(0.3, 1 + Math.floor(r() * 5)),
        ante: maybe(0.5, 1 + Math.floor(r() * 5)),
        straddle: r() < 0.5,
        maxRebuys: maybe(0.5, 1 + Math.floor(r() * 3)),
        rebuyUntilLevel: maybe(0.3, 1 + Math.floor(r() * 3)),
        bombEvery: bomb ? 2 + Math.floor(r() * 4) : undefined,
        bombAmount: bomb ? 10 + Math.floor(r() * 50) : undefined,
        ...(tournament
            ? { tournament: true, buyIn: 100 + Math.floor(r() * 400) + (r() < 0.3 ? 0.5 : 0), startingChips: 500 + Math.floor(r() * 1000),
                addOnPrice: addOn ? 150 : undefined, addOnChips: addOn ? 700 : undefined, payouts: maybe(0.3, [60, 25, 15]) }
            : { addOnAmount: addOn ? 100 + Math.floor(r() * 200) : undefined, minBuyIn: maybe(0.3, 50), maxBuyIn: maybe(0.3, 2000) }),
    };
};

// Betting never waits on a player who folded or is all-in.
const assertActorCanAct = (s: PokerGameState, where: string) => {
    if (s.gameStage === 'pre-deal' || s.gameStage === 'showdown') return;
    const p = s.players[s.activePlayerIndex];
    assert.ok(p && p.inHand && !p.isAllIn, `${where}: action is on a player who can't act`);
};

// One random legal action, as the screens allow it.
const randomAction = (s: PokerGameState, r: () => number): PokerGameState => {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    if (s.gameStage === 'pre-deal') {
        const awaiting = s.bust?.awaiting ?? [];
        if (awaiting.length && r() < 0.9) return go(s, (x, io) => E.bustChoice(x, awaiting[0], r() < 0.5, io));
        const choice = r();
        if (choice < 0.03) return go(s, (x, io) => E.takeAddOn(x, pick(x.players).id, io));
        if (choice < 0.05) return go(s, (x, io) => E.toggleBombNext(x, io));
        if (choice < 0.06) return go(s, (x, io) => E.chop(x, io));
        if (choice < 0.07) return go(s, (x, io) => E.applySettings(x, randomSettings(r, !!x.tournament), clock, io));
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
        clock = 0;
        let s = E.newPokerGame(players, randomSettings(r, false), 0);
        for (let step = 0; step < 200; step++) {
            clock += 60_000;
            s = randomAction(s, r);
            const where = `seed ${seed}, step ${step}`;
            assertActorCanAct(s, where);
            const stacks = sum(s.players.map(p => p.stack));
            const inPot = sum(s.players.map(p => p.totalPotContribution - p.roundWinnings));
            const leftWith = sum((s.departed ?? []).map(d => d.net)); // players who left stay settled
            assert.equal(stacks + inPot + leftWith, sum(s.players.map(p => p.totalBuyIn)), `${where}: chips not conserved ${JSON.stringify(s.players.map(p => [p.name, p.stack, p.totalPotContribution, p.inHand, p.isAllIn]))}\n${s.messages.slice(-30).join('\n')}`);
            if (s.gameStage === 'showdown') {
                assert.equal(sum(s.pot.map(p => p.amount)) + sum(s.players.map(p => p.roundWinnings)), sum(s.players.map(p => p.totalPotContribution)), `${where}: pots`);
            }
            assert.ok(s.players.every(p => p.totalPotContribution >= 0), `${where}: negative contribution`);
            const settled = pokerSettlement(s);
            assert.equal(everyModeProblem(settled), null, where);
            assert.ok(Math.abs(settled.offBy) < 0.005, `${where}: off by ${settled.offBy}`);
        }
    }
});

test('a fold-out pays the whole pot to the last player and records each phone', () => {
    let s = E.newPokerGame([{ name: 'Asha', stack: 100, phoneNumber: '9000000001' }, { name: 'Raj', stack: 100, phoneNumber: '9000000002' }], { smallBlindAmount: 5, bigBlindAmount: 10 }, 0);
    s = go(s, (x, io) => E.startNewHand(x, io)); // Asha deals and posts the big blind; Raj posts the small and acts
    assert.equal(s.players[s.activePlayerIndex].name, 'Raj');
    const { state, records } = runStep(s, (x, io) => E.playerAction(x, 'fold', 0, io));
    assert.equal(state.gameStage, 'pre-deal');
    assert.deepEqual(state.players.map(p => p.stack), [105, 95]);
    assert.deepEqual(records, [{ phone: '9000000001', name: 'Asha', winnings: 5 }, { phone: '9000000002', name: 'Raj', winnings: -5 }]);
});

test('tournament chips are conserved over 50 seeded random games, prizes sum to the pool exactly, and the end settles', () => {
    let finished = 0;
    let chopped = 0;
    for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const players = Array.from({ length: 2 + Math.floor(r() * 8) }, (_, i) => ({ name: `P${i + 1}`, stack: 0, phoneNumber: String(9000000001 + i) }));
        clock = 0;
        let s = E.newPokerGame(players, randomSettings(r, true), 0);
        for (let step = 0; step < 400; step++) {
            clock += 60_000;
            lastRecords = [];
            const state = randomAction(s, r);
            const records = lastRecords;
            const where = `seed ${seed}, step ${step}`;
            assertActorCanAct(state, where);
            const entrants = state.entrants!;
            const inPlay = sum(state.players.map(p => p.stack + p.totalPotContribution - p.roundWinnings));
            assert.equal(inPlay, sum(entrants.map(e => e.chips)), `${where}: chips not conserved`);
            if (!state.tournamentOver) {
                assert.deepEqual(records, [], `${where}: winnings sent before the end`);
                assert.equal(pokerSettlement(state).transactions.length, 0, where);
            } else {
                const nets = entrants.map(e => e.prize! - e.paid);
                assert.equal(sum(entrants.map(e => paise(e.prize!))), poolPaise(entrants), `${where}: prizes don't sum to the pool`);
                assert.ok(entrants.every(e => e.prize! >= 0), where);
                const places = entrants.filter(e => e.place !== undefined).map(e => e.place!).sort((a, b) => a - b);
                assert.equal(new Set(places).size, places.length, `${where}: shared place ${JSON.stringify(entrants)}\n${state.messages.slice(-25).join('\n')}`);
                if (!state.chopOrder) assert.deepEqual(places, entrants.map((_, i) => i + 1), `${where}: places`);
                if (!s.tournamentOver) {
                    assert.deepEqual(records.map(x => x.winnings).sort(), nets.filter(n => Math.abs(n) >= 0.005).map(n => paise(n) / 100).sort(), `${where}: records`);
                    if (state.chopOrder) chopped++; else finished++;
                }
                const settled = pokerSettlement(state);
                assert.equal(everyModeProblem(settled), null, where);
                assert.ok(Math.abs(settled.offBy) < 0.005, `${where}: off by ${settled.offBy}`);
            }
            s = state;
            if (s.tournamentOver) break;
        }
    }
    assert.ok(finished > 5 && chopped > 5, `both endings ran: ${finished} finished, ${chopped} chopped`);
});

test('ending an unfinished tournament mid-hand returns the pot to its owners and chops', () => {
    const players = ['Asha', 'Raj', 'Dev'].map((name, i) => ({ name, stack: 0, phoneNumber: String(9000000001 + i) }));
    let s = E.newPokerGame(players, { smallBlindAmount: 5, bigBlindAmount: 10, tournament: true, buyIn: 500, startingChips: 1000 }, 0);
    s = go(s, (x, io) => E.startNewHand(x, io));
    const ended = runStep(s, E.endTournament).state;
    assert.equal(ended.tournamentOver, true);
    assert.deepEqual(ended.players.map(p => p.stack), [1000, 1000, 1000]);
    assert.deepEqual(ended.entrants!.map(e => e.prize), [500, 500, 500]);
});
