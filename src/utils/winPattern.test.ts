import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIN_PATTERN } from './winPattern.ts';

test('win lines from all three games celebrate', () => {
    for (const line of [
        'Congratulations! Asha won the pot of ₹30',
        'Asha wins the pot of ₹30. Their final stack is ₹1015.',
        'Asha & Ravi win(s) the pot of ₹40 (Split: ₹20 each).',
        'Asha (Hand 1) wins ₹10',
        'Asha (Hand 1) has BLACKJACK! Wins ₹15',
        'Streak Winnings! Asha receives ₹50 (₹50 from each player).',
    ]) {
        assert.match(line, WIN_PATTERN, line);
    }
});

test('ordinary log lines do not', () => {
    for (const line of [
        'Asha (Hand 1) loses ₹10',
        'Asha plays blind for ₹10. Pot is now ₹30.',
        'Total Pot: ₹30',
        'Asha folds.',
        '--- Turn is now on Ravi ---',
        'Asha raises to ₹40 (a raise of ₹20).',
        '↩ Last action undone.',
        '₹700 goes to Ravi, the only player left in this pot.',
        'Everyone folded; Ravi takes back their own ₹10. Their final stack is ₹1000.',
    ]) {
        assert.doesNotMatch(line, WIN_PATTERN, line);
    }
});

test('a tournament end and a chop celebrate; side-bet and insurance payouts only sound', () => {
    assert.match('Tournament over: 1st Asha ₹600, 2nd Raj ₹400', WIN_PATTERN);
    assert.match('Chop: Asha ₹300, Raj ₹300', WIN_PATTERN);
    assert.doesNotMatch('Asha (Hand 1) Perfect Pairs: Mixed, wins ₹60.', WIN_PATTERN);
    assert.doesNotMatch('Asha (Hand 1) insurance pays ₹10.', WIN_PATTERN);
});
