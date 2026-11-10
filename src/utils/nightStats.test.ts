import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biggestWin, emptyStats, partialStats, recordRound, sessionMinutes, statsNames, summaryLines } from './nightStats.ts';
import { formatAmount, toTitleCase } from './formatters.ts';
import type { Person } from './owingsLogic.ts';

// Party keys: phones for Asha/Raj/Dev, a name key for a phoneless Esha.
const A = '9000000001|Asha', R = '9000000002|Raj', D = '9000000003|Dev', E = 'name:Esha';
const NAMES = { [A]: 'Asha', [R]: 'Raj', [D]: 'Dev', [E]: 'Esha' };
const person = (key: string, title: string, net: number): Person =>
    ({ key, label: title, title, phone: key.includes('|') ? key.split('|')[0] : null, net });

test('formatAmount: whole amounts bare, up to 2 decimals, tiny amounts are 0', () => {
    assert.equal(formatAmount(500), '500');
    assert.equal(formatAmount(120.5), '120.5');
    assert.equal(formatAmount(120.25), '120.25');
    assert.equal(formatAmount(1200.456), '1200.46');
    assert.equal(formatAmount(-0.004), '0');
    assert.equal(formatAmount(0.1 + 0.2), '0.3');
});

test('names are trimmed when title-cased, so "Raj " and "raj" are one name', () => {
    assert.equal(toTitleCase('  raj kumar '), 'Raj Kumar');
    assert.equal(toTitleCase('Raj '), toTitleCase('raj'));
});

test('a winning round adds a win and extends the streak; a losing one resets it; names are kept per key', () => {
    let stats = recordRound(emptyStats(), { [A]: 300, [R]: -150, [D]: -150 }, { key: A, amount: 450 }, NAMES);
    stats = recordRound(stats, { [A]: 200, [R]: -200 }, { key: A, amount: 400 }, NAMES);
    stats = recordRound(stats, { [A]: -100, [R]: 100 }, { key: R, amount: 200 }, { [R]: 'Rajesh' });
    assert.equal(stats.rounds, 3);
    assert.deepEqual(stats.wins, { [A]: 2, [R]: 1 });
    assert.deepEqual(stats.streaks, { [A]: 0, [R]: 1, [D]: 0 });
    assert.deepEqual(stats.bestStreak, { key: A, count: 2 });
    assert.deepEqual(stats.biggest, { key: A, amount: 450 });
    assert.equal(stats.names[R], 'Rajesh');
    assert.equal(stats.names[A], 'Asha');
});

test('keys not in nets keep their streak; a net of 0.005 or less is not a win', () => {
    let stats = recordRound(emptyStats(), { [A]: 100, [R]: -100 }, null, NAMES);
    stats = recordRound(stats, { [R]: 0.005, [D]: -0.005 }, null, NAMES);
    assert.equal(stats.streaks[A], 1);
    assert.equal(stats.streaks[R], 0);
    assert.equal(stats.wins[R], undefined);
});

test('best streak and biggest change only when strictly greater', () => {
    let stats = recordRound(emptyStats(), { [A]: 10, [R]: 10 }, { key: A, amount: 500 }, NAMES);
    assert.deepEqual(stats.bestStreak, { key: A, count: 1 });
    stats = recordRound(stats, { [R]: 10 }, { key: R, amount: 500 }, NAMES);
    assert.deepEqual(stats.bestStreak, { key: R, count: 2 });
    assert.deepEqual(stats.biggest, { key: A, amount: 500 });
    stats = recordRound(stats, { [A]: 10 }, { key: D, amount: 501 }, NAMES);
    assert.deepEqual(stats.bestStreak, { key: R, count: 2 });
    assert.deepEqual(stats.biggest, { key: D, amount: 501 });
});

test('recordRound does not change the stats it is given', () => {
    const before = recordRound(emptyStats(), { [A]: 10 }, null, NAMES);
    recordRound(before, { [A]: 10 }, null, { [A]: 'Ash' });
    assert.deepEqual(before.wins, { [A]: 1 });
    assert.equal(before.rounds, 1);
    assert.equal(before.names[A], 'Asha');
});

test('summary lines in order, matching the share text sample', () => {
    const stats = { ...emptyStats(), rounds: 9, wins: { [A]: 7, [R]: 2 }, bestStreak: { key: R, count: 4 }, biggest: { key: A, amount: 2400 }, names: NAMES };
    const people = [person(R, 'Raj', -800), person(A, 'Asha', 1200), person(D, 'Dev', -400)];
    assert.deepEqual(summaryLines(stats, people, 'teen-patti', false), [
        'Biggest pot: ₹2400 (Asha)',
        'Most rounds won: Asha (7)',
        'Best streak: Raj (4 in a row)',
        'Biggest winner: Asha +₹1200',
        'Biggest loser: Raj -₹800',
    ]);
    assert.equal(summaryLines(stats, people, 'blackjack', false)[0], 'Biggest win: ₹2400 (Asha)');
});

test('a name at the table wins over the stats name; someone who left is named from stats', () => {
    const stats = { ...emptyStats(), wins: { [A]: 2, [E]: 2 }, names: { [A]: 'Ash', [E]: 'Esha' } };
    assert.deepEqual(summaryLines(stats, [person(A, 'Asha', 0)], 'poker', false), ['Most rounds won: Asha, Esha (2)']);
});

test('namesakes in stats are told apart, never merged', () => {
    const stats = { ...emptyStats(), wins: { [R]: 3, '9000001234|Raj': 3 }, names: { [R]: 'Raj', '9000001234|Raj': 'Raj' } };
    assert.deepEqual(summaryLines(stats, [], 'poker', false), ['Most rounds won: Raj (…0002), Raj (…1234) (3)']);
});

test('most rounds won lists tied labels alphabetically', () => {
    const stats = { ...emptyStats(), wins: { [R]: 3, [A]: 3, [D]: 1 }, names: NAMES };
    assert.deepEqual(summaryLines(stats, [], 'poker', false), ['Most rounds won: Asha, Raj (3)']);
});

test('lines are left out below their thresholds; the house is never winner or loser', () => {
    const stats = { ...emptyStats(), wins: { [A]: 0 }, bestStreak: { key: A, count: 1 }, names: NAMES };
    assert.deepEqual(summaryLines(stats, [person(A, 'Asha', 0.004), person(R, 'Raj', -0.004), person('house', 'Dealer (House)', 500)], 'blackjack', false), []);
});

test('biggest winner and loser ties go to the first player in order', () => {
    const people = [person(R, 'Raj', 50), person(A, 'Asha', 50), person(D, 'Dev', -50), person(E, 'Esha', -50)];
    assert.deepEqual(summaryLines(emptyStats(), people, 'poker', false), ['Biggest winner: Raj +₹50', 'Biggest loser: Dev -₹50']);
});

test('blackjack candidate is the largest positive net, first on a tie, none when nobody is up', () => {
    assert.deepEqual(biggestWin({ [R]: 50, [A]: 80, [D]: 80 }), { key: A, amount: 80 });
    assert.equal(biggestWin({ [R]: -50, [A]: 0 }), null);
});

test('partial stats: the note comes first and survives recorded rounds', () => {
    const stats = recordRound(partialStats(), { [A]: 10 }, null, NAMES);
    assert.equal(stats.partial, true);
    assert.deepEqual(summaryLines(stats, [], 'poker', false), ["Stats start from the app update; earlier rounds aren't counted.", 'Most rounds won: Asha (1)']);
    assert.equal(recordRound(emptyStats(), { [A]: 10 }, null, NAMES).partial, undefined);
});

test('the carried-in note comes last', () => {
    const lines = summaryLines(recordRound(partialStats(), { [A]: 10 }, null, NAMES), [person(A, 'Asha', 10)], 'teen-patti', true);
    assert.equal(lines[0], "Stats start from the app update; earlier rounds aren't counted.");
    assert.equal(lines.at(-1), 'Includes balances carried into this game.');
    assert.equal(summaryLines(emptyStats(), [], 'teen-patti', undefined).at(-1), 'May include balances carried into this game.');
    assert.equal(summaryLines(emptyStats(), [], 'teen-patti', false).length, 0);
});

test('stats names: the latest title-cased name per party key', () => {
    assert.deepEqual(statsNames([{ name: 'asha', phoneNumber: '9000000001' }, { name: ' esha ' }]), { [A]: 'Asha', [E]: 'Esha' });
});

test('the imbalance line comes last, signed, only when a paisa or more is uncovered', () => {
    assert.deepEqual(summaryLines(emptyStats(), [], 'teen-patti', true, 500), ['Includes balances carried into this game.', 'Balances are off by +₹500: settle the difference by hand.']);
    assert.deepEqual(summaryLines(emptyStats(), [], 'teen-patti', false, -12.5), ['Balances are off by -₹12.5: settle the difference by hand.']);
    assert.deepEqual(summaryLines(emptyStats(), [], 'teen-patti', false, 0.004), []);
});

test('session lines: whole minutes, hours from 60, and the winner per hour from 1 minute, before the carry, tournament and imbalance lines', () => {
    const people = [person(A, 'Asha', 101), person(R, 'Raj', -101)];
    const lines = (minutes?: number) => summaryLines(emptyStats(), people, 'poker', false, 0, { minutes });
    assert.deepEqual(lines(120).slice(-2), ['Session: 2h 0m', 'Asha won ₹51/hour']); // 50.5 rounds away from zero
    assert.deepEqual(lines(200).slice(-2), ['Session: 3h 20m', 'Asha won ₹30/hour']); // 30.3
    assert.deepEqual(lines(45).slice(-2), ['Session: 45m', 'Asha won ₹135/hour']); // 134.67
    assert.ok(!lines(0).some(l => l.startsWith('Session')));
    assert.ok(!lines(undefined).some(l => l.startsWith('Session')));
    assert.deepEqual(summaryLines(emptyStats(), [], 'poker', false, 0, { minutes: 45 }), ['Session: 45m']);
    assert.deepEqual(summaryLines(emptyStats(), people, 'poker', true, 1, { minutes: 45, tournament: 'Tournament: 1st Asha ₹101' }).slice(2), [
        'Session: 45m', 'Asha won ₹135/hour', 'Tournament: 1st Asha ₹101', 'Includes balances carried into this game.', 'Balances are off by +₹1: settle the difference by hand.',
    ]);
    assert.equal(sessionMinutes(1000, 1000 + 59_999), 0);
    assert.equal(sessionMinutes(1000, 1000 + 60_000), 1);
    assert.equal(sessionMinutes(undefined, 5), undefined);
});
