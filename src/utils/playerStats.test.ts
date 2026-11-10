import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headToHead, playerStats } from './playerStats.ts';
import type { HistoryEntry } from './history.ts';

const game = (endedAt: string, nets: [string, number][], deleted?: boolean): HistoryEntry =>
    ({ id: endedAt, endedAt, game: 'poker', nets: nets.map(([name, net]) => ({ name, net })), transactions: [], summary: [], deleted });

const entries = [
    game('2026-11-03T20:00:00.000Z', [['Asha', -40.1], ['Raj', 40.1]]),
    game('2026-11-01T20:00:00.000Z', [['Asha', 100], ['Raj', -60], ['Dev', -40]]),
    game('2026-11-02T20:00:00', [['Asha', 0.004], ['Dev', -0.004]]), // offset-less: local time
    game('2026-11-04T20:00:00.000Z', [['Asha', 999], ['Raj', -999]], true),
];

test('player stats: games, wins above half a paisa, total, best, worst, average and the running total oldest first', () => {
    const asha = playerStats(entries).find(s => s.name === 'Asha')!;
    assert.deepEqual({ ...asha, trend: asha.trend.map(t => t.total) }, {
        name: 'Asha', games: 3, won: 1, total: 59.9, best: 100, worst: -40.1, average: 19.97, trend: [100, 100, 59.9],
    });
    assert.deepEqual(playerStats(entries).map(s => s.name), ['Asha', 'Dev', 'Raj']);
    assert.deepEqual(playerStats([]), []);
});

test('head to head: only the games both played, each one\'s total there', () => {
    assert.deepEqual(headToHead(entries, 'Asha', 'Raj'), { games: 2, a: 59.9, b: -19.9 });
    assert.deepEqual(headToHead(entries, 'Raj', 'Dev'), { games: 1, a: -60, b: -40 });
});
