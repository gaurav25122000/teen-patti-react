import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockLabel, pauseClock, resumeClock, startClock, tickLevel, withClock } from './blindLevels.ts';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const game = (levelMinutes?: number) => ({ ...startClock(levelMinutes, T0), smallBlindAmount: 10, bigBlindAmount: 20 });

test('level 1 starts at setup; off when no minutes', () => {
    assert.deepEqual(startClock(15, T0), { levelMinutes: 15, blindLevel: 1, levelEndsAt: T0 + 15 * MIN });
    assert.deepEqual(startClock(undefined, T0), { blindLevel: 1 });
    assert.equal(clockLabel(game(), T0), null);
});

test('no change before the level ends', () => {
    const s = game(15);
    assert.deepEqual(tickLevel(s, T0 + 15 * MIN - 1), { state: s, line: null });
});

test('at the end of the level the next hand doubles the blinds, once', () => {
    const late = T0 + 50 * MIN; // three levels' worth of time passed
    const { state, line } = tickLevel(game(15), late);
    assert.equal(line, 'Blinds up: level 2, ₹20/₹40.');
    assert.equal(state.smallBlindAmount, 20);
    assert.equal(state.bigBlindAmount, 40);
    assert.equal(state.blindLevel, 2);
    assert.equal(state.levelEndsAt, late + 15 * MIN);
    assert.equal(tickLevel(state, late).line, null);
});

test('doubling starts from the current blinds', () => {
    const s = { ...game(10), smallBlindAmount: 25, bigBlindAmount: 50, blindLevel: 3 };
    assert.equal(tickLevel(s, T0 + 10 * MIN).line, 'Blinds up: level 4, ₹50/₹100.');
});

test('levels off never tick', () => {
    assert.equal(tickLevel(game(), T0 + 1000 * MIN).line, null);
});

test('pause keeps the time left; a paused clock does not tick; resume restarts from it', () => {
    const paused = pauseClock(game(15), T0 + 5 * MIN);
    assert.equal(paused.pausedRemainingMs, 10 * MIN);
    assert.equal(tickLevel(paused, T0 + 60 * MIN).line, null);
    assert.equal(clockLabel(paused, T0 + 60 * MIN), 'Paused · 10:00');
    const resumed = resumeClock(paused, T0 + 60 * MIN);
    assert.equal(resumed.levelEndsAt, T0 + 70 * MIN);
    assert.equal(resumed.pausedRemainingMs, undefined);
    assert.equal(clockLabel(resumed, T0 + 61 * MIN), 'Level 1 · ₹10/₹20 · 09:00');
});

test('pausing after time is up keeps 0 left', () => {
    assert.equal(pauseClock(game(15), T0 + 20 * MIN).pausedRemainingMs, 0);
});

test('display: running, time up, and seconds truncated', () => {
    assert.equal(clockLabel(game(15), T0), 'Level 1 · ₹10/₹20 · 15:00');
    assert.equal(clockLabel(game(15), T0 + 1), 'Level 1 · ₹10/₹20 · 14:59');
    assert.equal(clockLabel(game(15), T0 + 15 * MIN - 999), 'Level 1 · ₹10/₹20 · 00:00');
    assert.equal(clockLabel(game(15), T0 + 15 * MIN), 'Blinds go up next hand');
    assert.equal(clockLabel(game(240), T0), 'Level 1 · ₹10/₹20 · 240:00');
});

test('undo keeps the live clock: a restored step does not un-pause or rewind it', () => {
    const before = { ...game(15), gameStage: 'flop', smallBlindAmount: 10 };
    const live = pauseClock({ ...before, blindLevel: 2, levelEndsAt: T0 + 30 * MIN }, T0 + 20 * MIN);
    const restored = withClock(before, live);
    assert.equal(restored.gameStage, 'flop');
    assert.equal(restored.pausedRemainingMs, 10 * MIN);
    assert.equal(restored.levelEndsAt, T0 + 30 * MIN);
    assert.equal(restored.blindLevel, 2);
    assert.equal(withClock(live, before).pausedRemainingMs, undefined);
});
