import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, soundFor, toastLine } from './logFeedback.ts';
import { UNDO_LINE } from './log.ts';

test('added lines: appended ones, across a capped log, and only the last line of a replaced log', () => {
    assert.deepEqual(addedLines(['a', 'b'], ['a', 'b', 'c', 'd']), ['c', 'd']);
    assert.deepEqual(addedLines(['a', 'b', 'c'], ['b', 'c', 'd']), ['d']); // the oldest line dropped off the cap
    assert.deepEqual(addedLines(['a', 'b', 'c'], ['a', 'b', UNDO_LINE]), [UNDO_LINE]);
    assert.deepEqual(addedLines(['x'], ['New game', 'Set the boot']), ['Set the boot']);
    assert.deepEqual(addedLines([], ['Game setup']), ['Game setup']);
    const same = ['a'];
    assert.deepEqual(addedLines(same, same), []);
});

test('toast: the newest line that is not a turn change, without "ERROR: "', () => {
    assert.equal(toastLine(['Raj plays blind ₹10.', '--- Turn is now on Dev ---']), 'Raj plays blind ₹10.');
    assert.equal(toastLine(['--- Turn is now on Dev ---']), '--- Turn is now on Dev ---');
    assert.equal(toastLine(['ERROR: Max chaal is ₹100.']), 'Max chaal is ₹100.');
    assert.equal(toastLine([]), null);
});

test('one sound per batch, by priority', () => {
    assert.equal(soundFor(['Raj raises to ₹40 (a raise of ₹30).', 'Asha folds.', 'P2 & P3 win(s) the pot of ₹896 (Split: ₹448 each).']), 'win');
    assert.equal(soundFor(['ERROR: Can only remove players between hands.']), 'error');
    assert.equal(soundFor(['Rebuys closed after level 2.']), 'error');
    assert.equal(soundFor(['--- NEW HAND (#3) ---', 'Blinds up: level 2, ₹20/₹40.', 'Raj posts small blind of ₹20.']), 'level_up');
    assert.equal(soundFor(['--- NEW HAND (#3) ---', 'Raj posts small blind of ₹20.']), 'deal');
    assert.equal(soundFor(['Asha (Hand 1) stands.']), null);
    assert.equal(soundFor(['Asha (Hand 1) hits.']), 'card');
    assert.equal(soundFor([UNDO_LINE]), 'undo');
    assert.equal(soundFor(['Pot limit reached: pick the winner.']), 'alarm');
    assert.equal(soundFor(["Time's up, Raj."]), null);
    assert.equal(soundFor([]), null);
});

test('turn lines of every game are skipped, and this round\'s refusals sound as errors', () => {
    assert.equal(toastLine(['Asha calls ₹20.', 'Action is on Raj.']), 'Asha calls ₹20.');
    assert.equal(toastLine(['Asha (Hand 1) stands.', 'Turn is now on Raj, Hand #1']), 'Asha (Hand 1) stands.');
    assert.equal(toastLine(['--- Dealing the Flop ---', 'Action starts with Raj.']), '--- Dealing the Flop ---');
    for (const line of ['Asha is the banker this round.', 'Late entry is closed: a player is already out.', 'The tournament is over.',
        'Side bets can be at most ₹1000.', "Place the hand's bet first.", 'Insurance is off at this table.', 'Asha does not have enough chips.',
        'Cannot bet more than your stack.', 'Raj is out of chips.']) {
        assert.equal(soundFor([line]), 'error', line);
    }
});
