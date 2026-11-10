import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameTotals, inRange } from './winningsRange.ts';

const now = new Date(2026, 10, 10, 15, 0); // 10 Nov 2026, 3 pm local

test('date ranges are local: this month, this year, today and the 29 days before, and an inclusive custom range', () => {
    const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
    assert.equal(inRange(at(2026, 10, 1, 0), 'month', now), true);
    assert.equal(inRange(at(2026, 9, 31, 23), 'month', now), false);
    assert.equal(inRange(at(2026, 0, 1, 0), 'year', now), true);
    assert.equal(inRange(at(2025, 11, 31, 23), 'year', now), false);
    assert.equal(inRange(new Date(2026, 9, 12, 0, 0).toISOString(), '30d', now), true);
    assert.equal(inRange(new Date(2026, 9, 11, 23, 59).toISOString(), '30d', now), false);
    assert.equal(inRange(at(2026, 10, 3, 0), 'custom', now, '2026-11-03', '2026-11-05'), true);
    assert.equal(inRange(new Date(2026, 10, 5, 23, 59).toISOString(), 'custom', now, '2026-11-03', '2026-11-05'), true);
    assert.equal(inRange(at(2026, 10, 6, 0), 'custom', now, '2026-11-03', '2026-11-05'), false);
    assert.equal(inRange(at(2020, 0, 1), 'all', now), true);
});

test('totals and the cumulative trend come from the records in range only', () => {
    const records = [
        { phone_hash: 'h1', player_name: 'asha', game_type: 'poker', winnings: '100.5', timestamp: '2026-11-02T10:00:00Z' },
        { phone_hash: 'h1', player_name: 'asha', game_type: 'poker', winnings: -20, timestamp: '2026-11-02T18:00:00Z' },
        { phone_hash: 'h2', player_name: 'raj', game_type: 'poker', winnings: -80.5, timestamp: '2026-11-03T10:00:00Z' },
        { phone_hash: 'h2', player_name: 'raj', game_type: 'blackjack', winnings: 50, timestamp: '2026-11-03T10:00:00Z' },
    ];
    assert.deepEqual(gameTotals(records, ['h1', 'h2'], { h1: 'asha', h2: 'raj' }, 'poker'), {
        trend: [{ date: '2026-11-02', h1: 80.5, h2: 0 }, { date: '2026-11-03', h1: 80.5, h2: -80.5 }],
        players: [{ phoneHash: 'h1', playerName: 'asha', total: 80.5 }, { phoneHash: 'h2', playerName: 'raj', total: -80.5 }],
    });
});
