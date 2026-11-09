import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, archiveGame, buildEntry, hasUnreadableHistory, HISTORY_KEY, MAX_HISTORY, readHistory, setPaid, writeHistory, type HistoryEntry } from './history.ts';
import { emptyStats, recordRound } from './nightStats.ts';

// In-memory Storage with the methods history uses.
const memoryStorage = (initial: Record<string, string> = {}) => {
    const items = new Map(Object.entries(initial));
    return {
        items,
        get length() { return items.size; },
        key: (i: number) => [...items.keys()][i] ?? null,
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => { items.set(k, v); },
        removeItem: (k: string) => { items.delete(k); },
    };
};

const entry = (id: string): HistoryEntry => ({ id, endedAt: '2026-11-10T16:15:00.000Z', game: 'poker', nets: [], transactions: [], summary: [] });

test('entries go newest first and the oldest past 50 is dropped', () => {
    let list: HistoryEntry[] = [];
    for (let i = 1; i <= 51; i++) list = addEntry(list, entry(String(i)));
    assert.equal(list.length, 50);
    assert.equal(MAX_HISTORY, 50);
    assert.equal(list[0].id, '51');
    assert.equal(list[49].id, '2');
});

test('a written history reads back', () => {
    const storage = memoryStorage();
    writeHistory([entry('a')], storage);
    assert.deepEqual(readHistory(storage), [entry('a')]);
    assert.equal(readHistory(memoryStorage()).length, 0);
});

test('an unreadable value is kept under a timestamped key and history starts empty', () => {
    const storage = memoryStorage({ [HISTORY_KEY]: '{not json' });
    assert.deepEqual(readHistory(storage, 1000), []);
    assert.equal(storage.items.get('bets-history-unreadable-1000'), '{not json');
    assert.equal(storage.items.has(HISTORY_KEY), false);
    assert.equal(hasUnreadableHistory(storage), true);
});

test('a second unreadable value is kept too, never over the first', () => {
    const storage = memoryStorage({ [HISTORY_KEY]: 'bad one' });
    readHistory(storage, 1000);
    storage.setItem(HISTORY_KEY, '[{"id":1}]'); // parses, but is not a list of entries
    readHistory(storage, 2000);
    assert.equal(storage.items.get('bets-history-unreadable-1000'), 'bad one');
    assert.equal(storage.items.get('bets-history-unreadable-2000'), '[{"id":1}]');
});

test('when the raw value cannot be kept aside, it is left where it is', () => {
    const storage = memoryStorage({ [HISTORY_KEY]: 'bad' });
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => readHistory(storage, 1000));
    assert.equal(storage.items.get(HISTORY_KEY), 'bad');
});

test('no unreadable notice for a clean store', () => {
    assert.equal(hasUnreadableHistory(memoryStorage({ [HISTORY_KEY]: '[]', other: 'x' })), false);
});

test('an entry carries nets, unpaid transactions and the summary', () => {
    const stats = recordRound(emptyStats(), { Asha: 300, Raj: -300 }, { name: 'Asha', amount: 600 });
    const nets = [{ name: 'Asha', net: 300 }, { name: 'Raj', net: -300 }];
    const built = buildEntry('teen-patti', stats, nets, [{ from: 'Raj', to: 'Asha', amount: 300 }], new Date('2026-11-10T16:15:00.000Z'));
    assert.equal(built.endedAt, '2026-11-10T16:15:00.000Z');
    assert.equal(built.game, 'teen-patti');
    assert.deepEqual(built.transactions, [{ from: 'Raj', to: 'Asha', amount: 300, paid: false }]);
    assert.deepEqual(built.summary, ['Biggest pot: ₹600 (Asha)', 'Most rounds won: Asha (1)', 'Biggest winner: Asha +₹300', 'Biggest loser: Raj -₹300']);
});

test('the paid checkbox changes only that transaction of that entry', () => {
    const a = { ...entry('a'), transactions: [{ from: 'Raj', to: 'Asha', amount: 1, paid: false }, { from: 'Dev', to: 'Asha', amount: 2, paid: false }] };
    const b = { ...entry('b'), transactions: [{ from: 'Raj', to: 'Asha', amount: 1, paid: false }] };
    const next = setPaid([a, b], 'a', 1, true);
    assert.deepEqual(next[0].transactions.map(t => t.paid), [false, true]);
    assert.deepEqual(next[1].transactions.map(t => t.paid), [false]);
});

test('an entry whose inner items are malformed makes the history unreadable', () => {
    const bad = [
        { ...entry('a'), transactions: [{ from: 'A', to: 'B' }] },
        { ...entry('b'), nets: [{ name: 'A' }] },
        { ...entry('c'), summary: [7] },
        { ...entry('d'), nets: [null] },
        { ...entry('e'), nets: [{ net: 5 }] },
    ];
    for (const e of bad) {
        const storage = memoryStorage({ [HISTORY_KEY]: JSON.stringify([e]) });
        assert.deepEqual(readHistory(storage, 5), [], e.id);
        assert.equal(storage.items.has('bets-history-unreadable-5'), true, e.id);
    }
});

test('archiving: a game with no rounds is not saved, one with a round is, a failed save returns its message', () => {
    const storage = memoryStorage();
    const nets = [{ name: 'Asha', net: 50 }];
    assert.equal(archiveGame('poker', emptyStats(), nets, [], storage), null);
    assert.equal(archiveGame('poker', undefined, nets, [], storage), null);
    assert.equal(storage.items.has(HISTORY_KEY), false);
    const played = recordRound(emptyStats(), { Asha: 50 }, null);
    assert.equal(archiveGame('poker', played, nets, [], storage), null);
    assert.equal(readHistory(storage).length, 1);
    storage.setItem = () => { throw new Error('quota exceeded'); };
    assert.equal(archiveGame('poker', played, nets, [], storage), "Couldn't save: quota exceeded");
});
