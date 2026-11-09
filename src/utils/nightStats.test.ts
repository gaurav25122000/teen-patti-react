import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biggestWin, emptyStats, partialStats, recordRound, summaryLines } from './nightStats.ts';
import { formatAmount, toTitleCase } from './formatters.ts';

test('formatAmount: whole amounts bare, up to 2 decimals, tiny amounts are 0', () => {
    assert.equal(formatAmount(500), '500');
    assert.equal(formatAmount(120.5), '120.5');
    assert.equal(formatAmount(120.25), '120.25');
    assert.equal(formatAmount(1200.456), '1200.46');
    assert.equal(formatAmount(-0.004), '0');
    assert.equal(formatAmount(0.1 + 0.2), '0.3');
});

test('a winning round adds a win and extends the streak; a losing one resets it', () => {
    let stats = recordRound(emptyStats(), { Asha: 300, Raj: -150, Dev: -150 }, { name: 'Asha', amount: 450 });
    stats = recordRound(stats, { Asha: 200, Raj: -200 }, { name: 'Asha', amount: 400 });
    stats = recordRound(stats, { Asha: -100, Raj: 100 }, { name: 'Raj', amount: 200 });
    assert.equal(stats.rounds, 3);
    assert.deepEqual(stats.wins, { Asha: 2, Raj: 1 });
    assert.deepEqual(stats.streaks, { Asha: 0, Raj: 1, Dev: 0 });
    assert.deepEqual(stats.bestStreak, { name: 'Asha', count: 2 });
    assert.deepEqual(stats.biggest, { name: 'Asha', amount: 450 });
});

test('names not in nets keep their streak; a net of 0.005 or less is not a win', () => {
    let stats = recordRound(emptyStats(), { Asha: 100, Raj: -100 }, null);
    stats = recordRound(stats, { Raj: 0.005, Dev: -0.005 }, null);
    assert.equal(stats.streaks.Asha, 1);
    assert.equal(stats.streaks.Raj, 0);
    assert.equal(stats.wins.Raj, undefined);
});

test('best streak and biggest change only when strictly greater', () => {
    let stats = recordRound(emptyStats(), { Asha: 10, Raj: 10 }, { name: 'Asha', amount: 500 });
    assert.deepEqual(stats.bestStreak, { name: 'Asha', count: 1 });
    stats = recordRound(stats, { Raj: 10 }, { name: 'Raj', amount: 500 });
    assert.deepEqual(stats.bestStreak, { name: 'Raj', count: 2 });
    assert.deepEqual(stats.biggest, { name: 'Asha', amount: 500 });
    stats = recordRound(stats, { Asha: 10 }, { name: 'Dev', amount: 501 });
    assert.deepEqual(stats.bestStreak, { name: 'Raj', count: 2 });
    assert.deepEqual(stats.biggest, { name: 'Dev', amount: 501 });
});

test('recordRound does not change the stats it is given', () => {
    const before = recordRound(emptyStats(), { Asha: 10 }, null);
    recordRound(before, { Asha: 10 }, null);
    assert.deepEqual(before.wins, { Asha: 1 });
    assert.equal(before.rounds, 1);
});

test('summary lines in order, matching the share text sample', () => {
    const stats = {
        rounds: 9,
        wins: { Asha: 7, Raj: 2 },
        streaks: { Asha: 0, Raj: 0 },
        bestStreak: { name: 'Raj', count: 4 },
        biggest: { name: 'Asha', amount: 2400 },
    };
    const nets = [{ name: 'Raj', net: -800 }, { name: 'Asha', net: 1200 }, { name: 'Dev', net: -400 }];
    assert.deepEqual(summaryLines(stats, nets, 'teen-patti'), [
        'Biggest pot: ₹2400 (Asha)',
        'Most rounds won: Asha (7)',
        'Best streak: Raj (4 in a row)',
        'Biggest winner: Asha +₹1200',
        'Biggest loser: Raj -₹800',
    ]);
    assert.equal(summaryLines(stats, nets, 'blackjack')[0], 'Biggest win: ₹2400 (Asha)');
});

test('most rounds won lists tied names alphabetically', () => {
    const stats = { ...emptyStats(), wins: { Raj: 3, Asha: 3, Dev: 1 } };
    assert.deepEqual(summaryLines(stats, [], 'poker'), ['Most rounds won: Asha, Raj (3)']);
});

test('lines are left out below their thresholds', () => {
    const stats = { ...emptyStats(), wins: { Asha: 0 }, bestStreak: { name: 'Asha', count: 1 } };
    assert.deepEqual(summaryLines(stats, [{ name: 'Asha', net: 0.004 }, { name: 'Raj', net: -0.004 }], 'poker'), []);
});

test('biggest winner and loser ties go to the first player in order', () => {
    const nets = [{ name: 'Raj', net: 50 }, { name: 'Asha', net: 50 }, { name: 'Dev', net: -50 }, { name: 'Esha', net: -50 }];
    assert.deepEqual(summaryLines(emptyStats(), nets, 'poker'), ['Biggest winner: Raj +₹50', 'Biggest loser: Dev -₹50']);
});

test('blackjack candidate is the largest positive net, first on a tie, none when nobody is up', () => {
    assert.deepEqual(biggestWin({ Raj: 50, Asha: 80, Dev: 80 }), { name: 'Asha', amount: 80 });
    assert.equal(biggestWin({ Raj: -50, Asha: 0 }), null);
});

test('partial stats: the note comes first and survives recorded rounds', () => {
    const stats = recordRound(partialStats(), { Asha: 10 }, null);
    assert.equal(stats.partial, true);
    assert.deepEqual(summaryLines(stats, [], 'poker'), ["Stats start from the app update; earlier rounds aren't counted.", 'Most rounds won: Asha (1)']);
    assert.equal(recordRound(emptyStats(), { Asha: 10 }, null).partial, undefined);
});

test('the carried-in note comes last', () => {
    const lines = summaryLines(recordRound(partialStats(), { Asha: 10 }, null), [{ name: 'Asha', net: 10 }], 'teen-patti', true);
    assert.equal(lines[0], "Stats start from the app update; earlier rounds aren't counted.");
    assert.equal(lines.at(-1), "Carried-in balances aren't included.");
    assert.equal(summaryLines(emptyStats(), [], 'teen-patti', false).length, 0);
});


test('names are trimmed when title-cased, so "Raj " and "raj" are one person', () => {
    assert.equal(toTitleCase('  raj kumar '), 'Raj Kumar');
    assert.equal(toTitleCase('Raj '), toTitleCase('raj'));
});
