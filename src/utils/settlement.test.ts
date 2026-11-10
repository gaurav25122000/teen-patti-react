import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText, upiFor, upiLink, whatsappLink } from './settlement.ts';
import { cardLines } from './settlementImage.ts';

const saved = [
    { name: 'asha', phone: '9000000001', upi: 'asha@okhdfc' },
    { name: 'Raj', phone: '9000000002' },
    { name: 'Raj', phone: '9000000003', upi: 'raj@okaxis' },
];

test('upiFor looks up by exact phone, never by name', () => {
    assert.equal(upiFor('9000000001', saved), 'asha@okhdfc');
    assert.equal(upiFor('9000000002', saved), undefined);
    assert.equal(upiFor('9000000003', saved), 'raj@okaxis');
    assert.equal(upiFor(null, saved), undefined);
    assert.equal(upiFor('9999999999', saved), undefined);
});

test('UPI link encodes each value, amount with 2 decimals', () => {
    assert.equal(upiLink('asha@okhdfc', 'Asha', 500), 'upi://pay?pa=asha%40okhdfc&pn=Asha&am=500.00&cu=INR&tn=Bets%20Manager');
    assert.equal(upiLink('a.b@ok', 'Asha Rao', 120.5), 'upi://pay?pa=a.b%40ok&pn=Asha%20Rao&am=120.50&cu=INR&tn=Bets%20Manager');
});

test('share text: UPI where the payee phone has one, then the night summary', () => {
    const text = shareText(
        [{ from: 'Dev', to: 'Asha', amount: 500, toPhone: '9000000001' }, { from: 'Dev', to: 'Raj', amount: 120.5, toPhone: '9000000002' }],
        ['Biggest pot: ₹2400 (Asha)', 'Most rounds won: Asha (7)'],
        saved
    );
    assert.equal(text, [
        'Bets Manager settlement',
        'Dev pays Asha ₹500 (UPI: asha@okhdfc)',
        'Dev pays Raj ₹120.5',
        '',
        'Night summary',
        'Biggest pot: ₹2400 (Asha)',
        'Most rounds won: Asha (7)',
    ].join('\n'));
});

test('share text with no transactions and no summary; a payee without a phone gets no UPI', () => {
    assert.equal(shareText([], [], saved), 'Bets Manager settlement\nAll settled up');
    assert.equal(shareText([{ from: 'Raj', to: 'Asha', amount: 10, toPhone: null }], [], saved), 'Bets Manager settlement\nRaj pays Asha ₹10');
});

test('WhatsApp link carries the encoded text', () => {
    assert.equal(whatsappLink('a b\nc&d'), 'https://wa.me/?text=a%20b%0Ac%26d');
});

test('no transfers with books that are off reads "No transfers between players"', () => {
    assert.equal(shareText([], ['Balances are off by +₹500: settle the difference by hand.'], []),
        'Bets Manager settlement\nNo transfers between players\n\nNight summary\nBalances are off by +₹500: settle the difference by hand.');
});

test('the image card: title, game and date, then the share text under its heading', () => {
    assert.deepEqual(cardLines('Bets Manager settlement\nDev pays Asha ₹500 (UPI: asha@okhdfc)\n\nNight summary\nBiggest pot: ₹2400 (Asha)', 'Poker · 10 Nov 2026'),
        ['Bets Manager', 'Poker · 10 Nov 2026', '', 'Dev pays Asha ₹500 (UPI: asha@okhdfc)', '', 'Night summary', 'Biggest pot: ₹2400 (Asha)']);
});
