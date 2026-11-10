import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, archiveGame, buildEntry, deleteHistoryEntry, hasUnreadableHistory, historyShareText, HISTORY_KEY, liveHistory, MAX_HISTORY, readHistory, setPaid, writeHistory, type HistoryEntry } from './history.ts';
import { emptyStats, partialStats, recordRound } from './nightStats.ts';
import type { Person } from './owingsLogic.ts';

const A = '9000000001|Asha', R = '9000000002|Raj';
const NAMES = { [A]: 'Asha', [R]: 'Raj' };
const person = (key: string, title: string, net: number): Person => ({ key, label: title, title, phone: key.includes('|') ? key.split('|')[0] : null, net });

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
    const stats = recordRound(emptyStats(), { [A]: 300, [R]: -300 }, { key: A, amount: 600 }, NAMES);
    const built = buildEntry('teen-patti', stats, { people: [person(A, 'Asha', 300), person(R, 'Raj', -300)], transactions: [{ from: 'Raj', to: 'Asha', amount: 300, toPhone: '9000000001' }], carried: false }, new Date('2026-11-10T16:15:00.000Z'));
    assert.equal(built.endedAt, '2026-11-10T16:15:00.000Z');
    assert.equal(built.game, 'teen-patti');
    assert.deepEqual(built.nets, [{ name: 'Asha', net: 300 }, { name: 'Raj', net: -300 }]);
    assert.deepEqual(built.transactions, [{ from: 'Raj', to: 'Asha', amount: 300, toPhone: '9000000001', paid: false }]);
    assert.deepEqual(built.summary, ['Biggest pot: ₹600 (Asha)', 'Most rounds won: Asha (1)', 'Biggest winner: Asha +₹300', 'Biggest loser: Raj -₹300']);
});

test('the paid checkbox changes only that transaction of that entry', () => {
    const a = { ...entry('a'), transactions: [{ from: 'Raj', to: 'Asha', amount: 1, toPhone: null, paid: false }, { from: 'Dev', to: 'Asha', amount: 2, toPhone: null, paid: false }] };
    const b = { ...entry('b'), transactions: [{ from: 'Raj', to: 'Asha', amount: 1, toPhone: null, paid: false }] };
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
        { ...entry('f'), transactions: [{ from: 'A', to: 'B', amount: 1, paid: false, toPhone: 9000000001 }] },
        { ...entry('g'), transactions: [{ from: 'A', to: 'B', amount: 1, paid: false }] },
    ];
    for (const e of bad) {
        const storage = memoryStorage({ [HISTORY_KEY]: JSON.stringify([e]) });
        assert.deepEqual(readHistory(storage, 5), [], e.id);
        assert.equal(storage.items.has('bets-history-unreadable-5'), true, e.id);
    }
});

test('archiving keeps a game that had a round or moved money, the house included', () => {
    const storage = memoryStorage();
    const even = { people: [person(A, 'Asha', 0.004), person(R, 'Raj', -0.004)], transactions: [], carried: false };
    assert.equal(archiveGame('blackjack', emptyStats(), even, storage), null);
    assert.equal(archiveGame('blackjack', emptyStats(), { ...even, people: [...even.people, person('house', 'Dealer (House)', 0.004)] }, storage), null);
    assert.equal(storage.items.has(HISTORY_KEY), false);
    assert.equal(archiveGame('blackjack', emptyStats(), { ...even, people: [...even.people, person('house', 'Dealer (House)', 50)] }, storage), null);
    assert.equal(archiveGame('poker', emptyStats(), { ...even, people: [person(A, 'Asha', 50)] }, storage), null);
    assert.equal(archiveGame('poker', recordRound(emptyStats(), { [A]: 0 }, null, NAMES), even, storage), null);
    assert.equal(readHistory(storage).length, 3);
});

test('a save from before stats existed is kept with the partial-stats line first', () => {
    const storage = memoryStorage();
    archiveGame('teen-patti', undefined, { people: [person(A, 'Asha', 50), person(R, 'Raj', -50)], transactions: [], carried: false }, storage);
    const [kept] = readHistory(storage);
    assert.equal(kept.summary[0], "Stats start from the app update; earlier rounds aren't counted.");
    assert.deepEqual(partialStats().partial, true);
});

test('a failed archive returns its message', () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error('quota exceeded'); };
    const played = recordRound(emptyStats(), { [A]: 50 }, null, NAMES);
    const failed = archiveGame('poker', played, { people: [], transactions: [], carried: false }, storage);
    assert.equal(failed?.message, "Couldn't save: quota exceeded");
    assert.equal(failed?.entry.summary[0], 'Most rounds won: Asha (1)');
});

test('re-share sends only unpaid transfers; all paid reads "All settled up" and keeps the summary', () => {
    const e = {
        ...entry('a'),
        transactions: [{ from: 'Raj', to: 'Asha', amount: 100, toPhone: '9000000001', paid: true }, { from: 'Dev', to: 'Asha', amount: 50, toPhone: '9000000001', paid: false }],
        summary: ['Most rounds won: Asha (3)'],
    };
    const saved = [{ name: 'Asha', phone: '9000000001', upi: 'asha@okhdfc' }];
    assert.equal(historyShareText(e, saved), 'Bets Manager settlement\nDev pays Asha ₹50 (UPI: asha@okhdfc)\n\nNight summary\nMost rounds won: Asha (3)');
    const allPaid = { ...e, transactions: e.transactions.map(t => ({ ...t, paid: true })) };
    assert.equal(historyShareText(allPaid, saved), 'Bets Manager settlement\nAll settled up\n\nNight summary\nMost rounds won: Asha (3)');
});

test("a carried-in game says so last in its summary", () => {
    const stats = recordRound(emptyStats(), { [A]: 50 }, null, NAMES);
    const built = buildEntry('teen-patti', stats, { people: [person(A, 'Asha', 50), person(R, 'Raj', -50)], transactions: [], carried: true });
    assert.equal(built.summary.at(-1), 'Includes balances carried into this game.');
});

test('a blackjack entry lists players only; the house stays out of its nets', () => {
    const built = buildEntry('blackjack', emptyStats(), { people: [person(A, 'Asha', -300), person('house', 'Dealer (House)', 300)], transactions: [], carried: false });
    assert.deepEqual(built.nets, [{ name: 'Asha', net: -300 }]);
});

test('an entry whose nets do not add up says so last', () => {
    const built = buildEntry('teen-patti', emptyStats(), { people: [person(A, 'Asha', 500)], transactions: [], carried: true, offBy: 500 });
    assert.equal(built.summary.at(-1), 'Balances are off by +₹500: settle the difference by hand.');
});

test('history keeps the newest 50, plus older games with an unpaid transfer, up to 200', () => {
    const unpaid = (id: string): HistoryEntry => ({ ...entry(id), transactions: [{ from: 'A', to: 'B', amount: 1, toPhone: null, paid: false }] });
    let list: HistoryEntry[] = [];
    for (let i = 1; i <= 260; i++) list = addEntry(list, i <= 210 ? unpaid(`u${i}`) : entry(`p${i}`));
    assert.equal(list.length, 200);
    assert.equal(list[0].id, 'p260');
    assert.equal(list[49].id, 'p211');
    assert.equal(list[50].id, 'u210');
    const settledOld = addEntry([...Array.from({ length: 50 }, (_, i) => entry(`n${i}`)), entry('old-paid')], entry('new'));
    assert.equal(settledOld.length, 50);
    assert.equal(settledOld.some(e => e.id === 'old-paid'), false);
});

test('deleting a game leaves a tombstone; tombstones are hidden and never count toward the cap', () => {
    const list = deleteHistoryEntry([entry('a'), entry('b')], 'a', 99);
    assert.deepEqual(list[0], { ...entry('a'), deleted: true, updatedAt: 99 });
    assert.deepEqual(liveHistory(list).map(e => e.id), ['b']);
    let many: HistoryEntry[] = [{ ...entry('gone'), deleted: true }];
    for (let i = 1; i <= 50; i++) many = addEntry(many, entry(`g${i}`));
    assert.equal(liveHistory(many).length, 50);
    assert.equal(many.some(e => e.id === 'gone'), true);
});

test('a paid tick stamps the entry for sync', () => {
    const a = { ...entry('a'), transactions: [{ from: 'R', to: 'A', amount: 1, toPhone: null, paid: false }] };
    assert.equal(setPaid([a], 'a', 0, true, 77)[0].updatedAt, 77);
});

test('an unbalanced game is kept past the newest 50 like an unpaid one', () => {
    const off = { ...entry('off'), summary: ['Balances are off by +₹5: settle the difference by hand.'] };
    let list: HistoryEntry[] = [off];
    for (let i = 1; i <= 50; i++) list = addEntry(list, entry(`g${i}`));
    assert.equal(list.some(e => e.id === 'off'), true);
});
