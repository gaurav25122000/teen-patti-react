import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillRow, readSavedPlayers, saveEntry, upsertPlayers, type SavedPlayer } from './savedPlayers.ts';

const asha: SavedPlayer = { name: 'Asha', phone: '9000000001', upi: 'asha@okhdfc' };

test('upsert by phone: latest trimmed name wins, an existing UPI ID stays, new phones are added', () => {
    const { list, refused } = upsertPlayers([asha], [
        { name: '  Asha Rao ', phone: '9000000001' },
        { name: 'Raj', phone: '9000000002' },
    ]);
    assert.equal(refused, 0);
    assert.deepEqual(list, [
        { name: 'Asha Rao', phone: '9000000001', upi: 'asha@okhdfc' },
        { name: 'Raj', phone: '9000000002' },
    ]);
});

test('upsert skips players without a valid phone or name', () => {
    const { list } = upsertPlayers([], [{ name: 'Raj', phone: '' }, { name: 'Dev', phone: '12345' }, { name: ' ', phone: '9000000003' }]);
    assert.deepEqual(list, []);
});

test('at 200 entries a new player is refused but an existing one still updates', () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ name: `P${i}`, phone: String(9000000000 + i) }));
    const { list, refused } = upsertPlayers(full, [{ name: 'New', phone: '8000000000' }, { name: 'Renamed', phone: '9000000000' }]);
    assert.equal(refused, 1);
    assert.equal(list.length, 200);
    assert.equal(list[0].name, 'Renamed');
    assert.equal(saveEntry(full, { name: 'New', phone: '8000000000', upi: '' }), 'You can save up to 200 players.');
});

test('add and edit validate name, phone, UPI and phone uniqueness', () => {
    const list = [asha, { name: 'Raj', phone: '9000000002' }];
    assert.equal(saveEntry(list, { name: ' ', phone: '9000000003', upi: '' }), 'Enter a name.');
    assert.equal(saveEntry(list, { name: 'Dev', phone: '900000000', upi: '' }), 'Phone must be 10 digits.');
    assert.equal(saveEntry(list, { name: 'Dev', phone: '9000000003', upi: 'dev@' }), 'Enter a valid UPI ID.');
    assert.equal(saveEntry(list, { name: 'Dev', phone: '9000000003', upi: 'dev@ok1' }), 'Enter a valid UPI ID.');
    assert.equal(saveEntry(list, { name: 'Dev', phone: '9000000002', upi: '' }), 'Another saved player has this phone.');
    assert.equal(saveEntry(list, { name: 'Raj', phone: '9000000001', upi: '' }, '9000000002'), 'Another saved player has this phone.');
});

test('add trims and stores UPI only when present; edit replaces in place, may change phone and clear UPI', () => {
    const added = saveEntry([asha], { name: ' Dev ', phone: '9000000003', upi: ' dev.k-1@okaxis ' });
    assert.deepEqual(added, [asha, { name: 'Dev', phone: '9000000003', upi: 'dev.k-1@okaxis' }]);
    const edited = saveEntry([asha], { name: 'Asha', phone: '9000000009', upi: '' }, '9000000001');
    assert.deepEqual(edited, [{ name: 'Asha', phone: '9000000009' }]);
    assert.deepEqual(saveEntry([asha], { name: 'Asha', phone: '9000000001', upi: 'asha@okhdfc' }, '9000000001'), [asha]);
});

test('reading drops malformed entries and survives bad JSON', () => {
    const stored = JSON.stringify([asha, { name: 'X', phone: '12' }, { phone: '9000000002' }, { name: 'Bad', phone: '9000000003', upi: 'nope' }]);
    assert.deepEqual(readSavedPlayers({ getItem: () => stored }), [asha]);
    assert.deepEqual(readSavedPlayers({ getItem: () => '{oops' }), []);
    const dupes = JSON.stringify([asha, { name: 'Asha 2', phone: asha.phone }, { name: ' ', phone: '9000000004' }]);
    assert.deepEqual(readSavedPlayers({ getItem: () => dupes }), [asha]);
    assert.deepEqual(readSavedPlayers({ getItem: () => null }), []);
});

test('a chip fills the first row with empty name and phone, leaving the amount alone', () => {
    const rows = [
        { name: 'Raj', phoneNumber: '9000000002', balance: '50' },
        { name: '', phoneNumber: '', balance: '100' },
        { name: '', phoneNumber: '', balance: '0' },
    ];
    const blank = { name: '', phoneNumber: '', balance: '0' };
    assert.deepEqual(fillRow(rows, asha, blank)[1], { name: 'Asha', phoneNumber: '9000000001', balance: '100' });
    assert.deepEqual(fillRow(rows, asha, blank)[2], rows[2]);
});

test('a chip adds a row when no row is empty; a row with only a name or phone is not empty', () => {
    const rows = [{ name: 'Raj', phoneNumber: '' }, { name: '', phoneNumber: '9000000005' }];
    const next = fillRow(rows, asha, { name: '', phoneNumber: '' });
    assert.equal(next.length, 3);
    assert.deepEqual(next[2], { name: 'Asha', phoneNumber: '9000000001' });
    assert.deepEqual(fillRow([], asha, { name: '', phoneNumber: '', stack: '1000' }), [{ name: 'Asha', phoneNumber: '9000000001', stack: '1000' }]);
});
