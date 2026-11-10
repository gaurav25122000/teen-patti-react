import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.ts';
import { runStep, type Io } from '../utils/engine.ts';
import type { PokerGameState, PokerPlayer } from './types/pokerGameTypes.ts';
import { calculatePots } from './utils/pokerLogic.ts';
import type { PokerSettings } from '../utils/gameSettings.ts';
import { pokerSettlement } from '../utils/gameSettlement.ts';
import { defaultPayouts, ordinal, prizeTable, tournamentLine } from './tournament.ts';

const go = (s: PokerGameState, fn: (s: PokerGameState, io: Io) => PokerGameState, now = 0) => runStep(s, fn, () => now).state;
const table = (names: string[], settings: Partial<PokerSettings> = {}, stacks: number[] = []) => E.newPokerGame(
    names.map((name, i) => ({ name, stack: stacks[i] ?? 1000, phoneNumber: String(9000000001 + i) })),
    { smallBlindAmount: 5, bigBlindAmount: 10, ...settings },
    0
);
const deal = (s: PokerGameState) => go(s, (x, io) => E.startNewHand(x, io));
const act = (s: PokerGameState, action: E.PlayerAction, amount = 0) => go(s, (x, io) => E.playerAction(x, action, amount, io));
const newLines = (before: PokerGameState, after: PokerGameState) => after.messages.slice(before.messages.length);
const stacks = (s: PokerGameState) => s.players.map(p => p.stack);
const actor = (s: PokerGameState) => s.players[s.activePlayerIndex]?.name;

test('antes are dead money from every dealt-in player before the blinds', () => {
    const s = table(['Asha', 'Raj', 'Dev'], { ante: 2 });
    const dealt = deal(s);
    assert.deepEqual(stacks(dealt), [998, 993, 988]);
    assert.deepEqual(dealt.players.map(p => p.totalPotContribution), [2, 7, 12]);
    assert.deepEqual(dealt.players.map(p => p.roundBet), [0, 5, 10]);
    assert.ok(newLines(s, dealt).includes('Antes: ₹2 from 3 players.'));
    assert.equal(actor(dealt), 'Asha');
});

test('a straddle is a live 2BB blind; the straddler holds the last option', () => {
    const s = table(['Asha', 'Raj', 'Dev', 'Mira'], { straddle: true });
    let h = deal(s); // Asha deals, Raj small, Dev big, Mira straddles
    assert.ok(newLines(s, h).includes('Mira straddles ₹20.'));
    assert.equal(h.currentBet, 20);
    assert.equal(h.optionHolderId, 4);
    assert.equal(actor(h), 'Asha');
    assert.ok(newLines(h, act(h, 'raise', 39)).includes('Raise must be by at least ₹20. Total bet must be at least ₹40.'));
    h = act(act(act(h, 'call'), 'call'), 'call');
    assert.equal(h.gameStage, 'pre-flop');
    assert.equal(actor(h), 'Mira');
    assert.equal(act(h, 'check').gameStage, 'flop');
});

test('no straddle when the straddler is short after the ante, or with only two dealt in', () => {
    const s = table(['Asha', 'Raj', 'Dev', 'Mira'], { straddle: true, ante: 2 }, [1000, 1000, 1000, 22]);
    const h = deal(s);
    assert.ok(newLines(s, h).includes('No straddle this hand: Mira is short.'));
    assert.equal(h.currentBet, 10);
    assert.equal(h.optionHolderId, 3);
    assert.equal(actor(h), 'Mira');
    const two = table(['Asha', 'Raj'], { straddle: true });
    assert.ok(!deal(two).messages.some(m => m.includes('straddle')));
});

test('every Nth hand is a bomb pot: no blinds, straight to the flop, the button still moves', () => {
    let s = table(['Asha', 'Raj', 'Dev'], { bombEvery: 2, bombAmount: 50 });
    s = act(act(deal(s), 'fold'), 'fold'); // hand 1: Dev's big blind wins Raj's small blind
    const bomb = deal(s);
    const lines = newLines(s, bomb);
    assert.equal(lines[0], '--- NEW HAND (#2) ---');
    assert.ok(lines.includes('BOMB POT: ₹50 from 3 players. Straight to the flop.'));
    assert.ok(!lines.some(l => l.includes('blind')));
    assert.deepEqual(stacks(bomb), [950, 945, 955]);
    assert.equal(bomb.gameStage, 'flop');
    assert.equal(bomb.currentBet, 0);
    assert.equal(bomb.dealerButtonIndex, 1);
    assert.equal(actor(bomb), 'Dev');
});

test('"Bomb pot next hand" is logged both ways and clears once the bomb hand starts', () => {
    const s = table(['Asha', 'Raj', 'Dev'], { bombEvery: 10, bombAmount: 50 });
    const on = go(s, (x, io) => E.toggleBombNext(x, io));
    assert.deepEqual(newLines(s, on), ['Next hand is a bomb pot.']);
    assert.deepEqual(newLines(on, go(on, (x, io) => E.toggleBombNext(x, io))), ['Next hand is no longer a bomb pot.']);
    const bomb = deal(on);
    assert.equal(bomb.gameStage, 'flop');
    assert.equal(bomb.bombNext, false);
});

test('a bomb pot with fewer than two players able to act goes to showdown', () => {
    const h = deal(table(['Asha', 'Raj'], { bombEvery: 1, bombAmount: 50 }, [1000, 30]));
    assert.equal(h.gameStage, 'showdown');
    assert.deepEqual(h.pot.map(p => p.amount), [60, 20]);
});

test('preflop action skips players all-in from the ante; nobody left to act means showdown', () => {
    const skip = deal(table(['Asha', 'Raj', 'Dev', 'Mira'], { ante: 5 }, [1000, 1000, 1000, 3]));
    assert.equal(actor(skip), 'Asha');
    const allIn = deal(table(['Asha', 'Raj'], { ante: 5 }, [3, 4]));
    assert.equal(allIn.gameStage, 'showdown');
    const matched = deal(table(['Asha', 'Raj'], { ante: 5 }, [1000, 3])); // Raj is all-in on the ante; Asha's big blind covers it
    assert.equal(matched.gameStage, 'showdown');
    assert.equal(matched.activePlayerIndex, -1);
});

test('rebuy limits: the count, the level cut-off with a clock, and min/max buy-in', () => {
    const rebuy = (s: PokerGameState, amount: number) => go(s, (x, io) => E.addChipsToPlayer(x, 1, amount, io));
    let s = table(['Asha', 'Raj'], { maxRebuys: 1, minBuyIn: 200, maxBuyIn: 500 });
    assert.deepEqual(newLines(s, rebuy(s, 100)), ['Buy-in must be at least ₹200.']);
    assert.deepEqual(newLines(s, go(s, (x, io) => E.addPlayer(x, 'Dev', 600, '9000000009', io))), ['Buy-in must be at most ₹500.']);
    s = rebuy(s, 300);
    assert.equal(s.players[0].stack, 1300);
    assert.equal(s.players[0].rebuys, 1);
    assert.deepEqual(newLines(s, rebuy(s, 300)), ['Asha has used all 1 rebuys.']);
    const late = { ...table(['Asha', 'Raj'], { levelMinutes: 10, rebuyUntilLevel: 1 }), blindLevel: 2 };
    assert.deepEqual(newLines(late, rebuy(late, 300)), ['Rebuys closed after level 1.']);
    const noClock = { ...table(['Asha', 'Raj'], { rebuyUntilLevel: 1 }), blindLevel: 2 };
    assert.equal(rebuy(noClock, 300).players[0].stack, 1300);
});

test('the add-on: once per player, only in level L+1 when rebuys close after L', () => {
    const addOn = (s: PokerGameState) => go(s, (x, io) => E.takeAddOn(x, 1, io));
    const s = table(['Asha', 'Raj'], { addOnAmount: 300, levelMinutes: 10, rebuyUntilLevel: 1 });
    assert.deepEqual(newLines(s, addOn(s)), ['Add-ons are open in level 2.']);
    const took = addOn({ ...s, blindLevel: 2 });
    assert.equal(took.messages.at(-1), 'Asha takes the add-on: ₹300.');
    assert.deepEqual([took.players[0].stack, took.players[0].totalBuyIn], [1300, 1300]);
    assert.deepEqual(newLines(took, addOn(took)), ['Asha already took the add-on.']);
    assert.equal(addOn(table(['Asha', 'Raj'], { addOnAmount: 300 })).players[0].stack, 1300);
});

test('settings between hands only; new level minutes restart the clock now, blank stops it', () => {
    const s = table(['Asha', 'Raj'], { levelMinutes: 10 });
    const apply = (x: PokerGameState, levelMinutes?: number) => go(x, (y, io) => E.applySettings(y, { ...E.pokerSettingsOf(y), levelMinutes }, 1000, io));
    const longer = apply({ ...s, blindLevel: 3 }, 20);
    assert.equal(longer.levelEndsAt, 1_201_000);
    assert.equal(longer.blindLevel, 3);
    assert.equal(longer.messages.at(-1), 'Settings: blind level 20 min');
    assert.equal(apply(s, undefined).levelEndsAt, undefined);
    const midHand = deal(s);
    assert.deepEqual(newLines(midHand, apply(midHand, 20)), ['Settings can only change between rounds.']);
});

test('tournament payouts: defaults by entrants, floored paise with the leftover to 1st, scaled when places outnumber entrants', () => {
    assert.deepEqual([3, 4, 5, 6, 8, 9].map(defaultPayouts), [[100], [65, 35], [65, 35], [50, 30, 20], [50, 30, 20], [45, 27, 18, 10]]);
    assert.deepEqual(prizeTable(100001, [50, 30, 20], 3), [50001, 30000, 20000]);
    assert.deepEqual(prizeTable(100002, [50, 30, 20], 3), [50002, 30000, 20000]);
    assert.deepEqual(prizeTable(100000, [50, 30, 20], 2), [62500, 37500]);
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
});

// Asha shoves, Raj and Dev call all-in; the main and side pots all go to Asha.
const shoveAndWin = (s: PokerGameState) => {
    let h = act(act(act(deal(s), 'all-in'), 'call'), 'call');
    const records = [];
    while (h.gameStage === 'showdown') {
        const out = runStep(h, (x, io) => E.awardPot(x, 0, [1], io));
        records.push(...out.records);
        h = out.state;
    }
    return { state: h, records };
};
const tournament = (settings: Partial<PokerSettings> = {}) =>
    table(['Asha', 'Raj', 'Dev'], { tournament: true, buyIn: 500, startingChips: 1000, ...settings });
const withStacks = (s: PokerGameState, chips: number[]) => ({ ...s, players: s.players.map((p, i) => ({ ...p, stack: chips[i] })) });

test('tournament: same-hand busts place by start-of-hand chips; the last player standing wins; winnings go out once', () => {
    const s = { ...withStacks(tournament({ payouts: [70, 30], levelMinutes: 10, rebuyUntilLevel: 1 }), [2000, 400, 600]), blindLevel: 2 };
    const { state, records } = shoveAndWin(s);
    assert.deepEqual(state.messages.slice(-3), ['Dev is out in 2nd place.', 'Raj is out in 3rd place.', 'Tournament over: 1st Asha ₹1050, 2nd Dev ₹450']);
    assert.deepEqual(state.entrants!.map(e => [e.place, e.prize]), [[1, 1050], [3, 0], [2, 450]]);
    assert.deepEqual(records, [
        { phone: '9000000001', name: 'Asha', winnings: 550 },
        { phone: '9000000002', name: 'Raj', winnings: -500 },
        { phone: '9000000003', name: 'Dev', winnings: -50 },
    ]);
    const settled = pokerSettlement(state);
    assert.deepEqual(settled.transactions.map(t => [t.from, t.to, t.amount]), [['Dev', 'Asha', 50], ['Raj', 'Asha', 500]]);
    assert.equal(settled.tournament, 'Tournament: 1st Asha ₹1050, 2nd Dev ₹450');
    assert.deepEqual(newLines(state, deal(state)), ['The tournament is over.']);
});

test('tournament: a start-of-hand tie goes to the seat earlier left of the dealer', () => {
    const s = { ...tournament({ levelMinutes: 10, rebuyUntilLevel: 1 }), blindLevel: 2 };
    assert.deepEqual(shoveAndWin(s).state.entrants!.map(e => e.place), [1, 2, 3]); // Asha deals: Raj sits first
    assert.deepEqual(shoveAndWin({ ...s, dealerButtonIndex: 0 }).state.entrants!.map(e => e.place), [1, 3, 2]); // Raj deals: Dev first
});

test('tournament: places wait for every rebuy decision; REBUY costs the buy-in for the starting chips', () => {
    const s = withStacks(tournament({ maxRebuys: 1 }), [2000, 400, 600]);
    const dev = { ...s, players: s.players.map(p => (p.name === 'Dev' ? { ...p, rebuys: 1 } : p)) };
    const { state } = shoveAndWin(dev);
    assert.deepEqual(state.bust, { ranked: [3, 2], awaiting: [2] });
    assert.ok(state.entrants!.every(e => e.place === undefined));
    assert.deepEqual(newLines(state, deal(state)), ['Raj is out of chips.']);
    const rebought = go(state, (x, io) => E.bustChoice(x, 2, true, io));
    assert.deepEqual(newLines(state, rebought), ['Raj rebuys: ₹500 for 1000 chips.', 'Dev is out in 3rd place.']);
    assert.deepEqual([rebought.players[1].stack, rebought.entrants![1].paid, rebought.entrants![1].chips], [1000, 1000, 2000]);
    const out = go(state, (x, io) => E.bustChoice(x, 2, false, io));
    assert.deepEqual(out.entrants!.map(e => e.place), [1, 3, 2]);
});

test('tournament chop: decided places paid, the rest by chips floored, leftover to the chip leader', () => {
    let s = tournament();
    s = act(act(act(deal(s), 'all-in'), 'call'), 'fold'); // Asha and Raj all-in, Dev folds his big blind
    while (s.gameStage === 'showdown') s = go(s, (x, io) => E.awardPot(x, 0, [1], io));
    s = go(s, (x, io) => E.bustChoice(x, 2, false, io));
    assert.equal(s.messages.at(-1), 'Raj is out in 3rd place.');
    assert.deepEqual(newLines(s, go(deal(s), (x, io) => E.chop(x, io))).at(-1), 'Can only chop between hands.');
    const { state, records } = runStep(s, (x, io) => E.chop(x, io));
    assert.equal(state.messages.at(-1), 'Chop: Asha ₹1005, Dev ₹495');
    assert.deepEqual(state.entrants!.map(e => e.prize), [1005, 0, 495]);
    assert.deepEqual(records.map(r => r.winnings), [505, -500, -5]);
    assert.equal(pokerSettlement(state).tournament, 'Tournament: Asha ₹1005 (chop), Dev ₹495 (chop)');
    const odd = runStep({ ...withStacks(s, [1001, 0, 999]), entrants: s.entrants!.map(e => ({ ...e, paid: 500.01 })) }, (x, io) => E.chop(x, io)).state;
    assert.deepEqual(odd.entrants!.map(e => e.prize), [750.77, 0, 749.26]);
    const floored = runStep(withStacks(s, [4000, 0, 3000]), (x, io) => E.chop(x, io)).state; // 857.142… and 642.857…
    assert.deepEqual(floored.entrants!.map(e => e.prize), [857.15, 0, 642.85]);
});

test('tournament rules: in progress settles nothing, streaks off, removal only once out, late entry pays the buy-in until someone is out', () => {
    let s = tournament({ addOnPrice: 200, addOnChips: 1500 });
    const settled = pokerSettlement(s);
    assert.equal(settled.notice, 'Tournament in progress: settle after it ends or chop.');
    assert.deepEqual(settled.transactions, []);
    assert.deepEqual(newLines(s, go(s, (x, io) => E.applyStreakWinnings(x, 1, 50, io))), ['Streak winnings are off in tournaments.']);
    assert.deepEqual(newLines(s, go(s, (x, io) => E.removePlayer(x, 3, io))), ['Players leave a tournament by going out.']);
    s = go(s, (x, io) => E.takeAddOn(x, 1, io));
    assert.equal(s.messages.at(-1), 'Asha takes the add-on: ₹200 for 1500 chips.');
    assert.deepEqual([s.players[0].stack, s.entrants![0].paid, s.entrants![0].chips], [2500, 700, 2500]);
    const joined = go(s, (x, io) => E.addPlayer(x, 'Mira', 5, '9000000009', io));
    assert.deepEqual([joined.players[3].stack, joined.entrants![3].paid, joined.entrants![3].chips], [1000, 500, 1000]);
    assert.equal(joined.messages.at(-1), 'Player Mira joins for ₹500 with 1000 chips.');
    const outDev = { ...s, entrants: s.entrants!.map(e => (e.id === 3 ? { ...e, place: 3 } : e)), players: s.players.map(p => (p.id === 3 ? { ...p, stack: 0 } : p)) };
    const removed = go(outDev, (x, io) => E.removePlayer(x, 3, io));
    assert.deepEqual(removed.players.map(p => p.name), ['Asha', 'Raj']);
    assert.equal(removed.entrants!.length, 3);
    assert.deepEqual(newLines(removed, go(removed, (x, io) => E.addPlayer(x, 'Mira', 5, '9000000009', io))), ['Late entry is closed: a player is already out.']);
});

test('the tournament line lists chop shares in chop order, then paid places', () => {
    const entrants = [
        { id: 1, name: 'Asha', paid: 500, chips: 1000, prize: 1200 },
        { id: 2, name: 'Raj', paid: 500, chips: 1000, prize: 800 },
        { id: 3, name: 'Dev', paid: 500, chips: 1000, place: 3, prize: 600 },
        { id: 4, name: 'Mira', paid: 500, chips: 1000, place: 4, prize: 0 },
    ];
    assert.equal(tournamentLine(entrants, [2, 1]), 'Tournament: Raj ₹800 (chop), Asha ₹1200 (chop), 3rd Dev ₹600');
});

test('folded money above every live player joins the top pot they can win', () => {
    const seat = (id: number, totalPotContribution: number, inHand: boolean, isAllIn: boolean) => ({ id, totalPotContribution, inHand, isAllIn }) as PokerPlayer;
    // Raj folded 640 against Dev all-in for 2 and Mira all-in for 298.
    const pots = calculatePots([seat(1, 640, false, false), seat(2, 2, true, true), seat(3, 298, true, true)]);
    assert.deepEqual(pots.map(p => [p.amount, [...p.eligiblePlayers]]), [[6, [2, 3]], [934, [3]]]);
});

test('no option for the big blind when everyone else is all-in for no more', () => {
    const h = act(deal(table(['Asha', 'Raj', 'Dev'], {}, [8, 5, 1000])), 'all-in'); // Raj's small blind and Asha's 8 are all-in
    assert.equal(h.gameStage, 'showdown');
});

test('tournament setup logs the buy-in and its settings; End game with a bust prompt open sends that player out first', () => {
    const s = tournament({ addOnPrice: 200, addOnChips: 1500 });
    assert.deepEqual(s.messages.slice(1), ['Tournament: ₹500 for 1000 chips.', 'Settings: buy-in ₹500, starting chips 1000, add-on ₹200 for 1500 chips']);
    let h = act(act(act(deal(s), 'all-in'), 'call'), 'fold');
    while (h.gameStage === 'showdown') h = go(h, (x, io) => E.awardPot(x, 0, [1], io));
    assert.deepEqual(h.bust?.awaiting, [2]);
    assert.deepEqual(newLines(h, go(h, (x, io) => E.chop(x, io))), ['Can only chop between hands.']);
    const ended = runStep(h, E.endTournament).state;
    assert.deepEqual(ended.messages.slice(-2), ['Raj is out in 3rd place.', 'Chop: Asha ₹1005, Dev ₹495']);
});

test('tournament: a player with no chips can\'t take the add-on, whether the bust prompt is open or they are placed', () => {
    let s = tournament({ addOnPrice: 200, addOnChips: 1500 });
    s = act(act(act(deal(s), 'all-in'), 'call'), 'fold');
    while (s.gameStage === 'showdown') s = go(s, (x, io) => E.awardPot(x, 0, [1], io));
    assert.deepEqual(s.bust?.awaiting, [2]);
    assert.deepEqual(newLines(s, go(s, (x, io) => E.takeAddOn(x, 2, io))), ['Raj is out of chips.']);
    const placed = go(s, (x, io) => E.bustChoice(x, 2, false, io));
    assert.deepEqual(newLines(placed, go(placed, (x, io) => E.takeAddOn(x, 2, io))), ['Raj is out of chips.']);
});

test('the stored settle-through hub carries across hands; a new game clears it; the add-on is refused once the tournament is over', () => {
    let s = { ...table(['Asha', 'Raj']), settleThrough: 'Raj' };
    s = act(deal(s), 'fold');
    assert.equal(s.settleThrough, 'Raj');
    assert.equal(table(['Asha', 'Raj']).settleThrough, undefined);
    const over = { ...tournament({ addOnPrice: 200, addOnChips: 1500 }), tournamentOver: true };
    assert.deepEqual(newLines(over, go(over, (x, io) => E.takeAddOn(x, 1, io))), ['The tournament is over.']);
});

test('decimal blinds stay in whole paise: pots, stacks and the log', () => {
    const r = (s: PokerGameState, fn: (s: PokerGameState, io: Io) => PokerGameState) => runStep(s, fn, () => 0, E.roundMoney).state;
    let s = r(table(['Asha', 'Raj', 'Dev'], { smallBlindAmount: 0.1, bigBlindAmount: 0.2 }), (x, io) => E.startNewHand(x, io));
    s = r(s, (x, io) => E.playerAction(x, 'call', 0, io));
    s = r(s, (x, io) => E.playerAction(x, 'call', 0, io));
    s = r(s, (x, io) => E.playerAction(x, 'check', 0, io));
    assert.ok(s.messages.includes('--- End of Betting Round. Total Pot: ₹0.6 ---'));
    for (let i = 0; i < 9 && s.gameStage !== 'showdown'; i++) s = r(s, (x, io) => E.playerAction(x, 'check', 0, io));
    assert.equal(s.gameStage, 'showdown');
    assert.deepEqual(s.pot.map(p => p.amount), [0.6]);
    assert.deepEqual(stacks(s), [999.8, 999.8, 999.8]);
});
