import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText, upiFor, upiLink, whatsappLink } from './settlement.ts';

const saved = [
    { name: 'asha', phone: '9000000001', upi: 'asha@okhdfc' },
    { name: 'Dev', phone: '9000000002' },
];

test('upiFor matches the title-cased name when exactly one match has a UPI ID', () => {
    assert.equal(upiFor('Asha', saved), 'asha@okhdfc');
    assert.equal(upiFor('Dev', saved), undefined);
    assert.equal(upiFor('Dealer (House)', saved), undefined);
    const twoIds = [...saved, { name: 'Asha', phone: '9000000003', upi: 'asha2@okaxis' }];
    assert.equal(upiFor('Asha', twoIds), undefined);
    const oneIdOfTwo = [...saved, { name: 'ASHA', phone: '9000000003' }];
    assert.equal(upiFor('Asha', oneIdOfTwo), 'asha@okhdfc');
});

test('UPI link encodes each value, amount with 2 decimals', () => {
    assert.equal(upiLink('asha@okhdfc', 'Asha', 500), 'upi://pay?pa=asha%40okhdfc&pn=Asha&am=500.00&cu=INR&tn=Bets%20Manager');
    assert.equal(upiLink('a.b@ok', 'Asha Rao', 120.5), 'upi://pay?pa=a.b%40ok&pn=Asha%20Rao&am=120.50&cu=INR&tn=Bets%20Manager');
});

test('share text: transactions with UPI where known, then the night summary', () => {
    const text = shareText(
        [{ from: 'Raj', to: 'Asha', amount: 500 }, { from: 'Dev', to: 'Esha', amount: 120.5 }],
        ['Biggest pot: ₹2400 (Asha)', 'Most rounds won: Asha (7)'],
        [{ name: 'Asha', phone: '9000000001', upi: 'asha@okhdfc' }, { name: 'Esha', phone: '9000000004' }]
    );
    assert.equal(text, [
        'Bets Manager settlement',
        'Raj pays Asha ₹500 (UPI: asha@okhdfc)',
        'Dev pays Esha ₹120.5',
        '',
        'Night summary',
        'Biggest pot: ₹2400 (Asha)',
        'Most rounds won: Asha (7)',
    ].join('\n'));
});

test('share text with no transactions and no summary', () => {
    assert.equal(shareText([], [], saved), 'Bets Manager settlement\nAll settled up');
    assert.equal(shareText([{ from: 'Raj', to: 'Dev', amount: 10 }], [], saved), 'Bets Manager settlement\nRaj pays Dev ₹10');
});

test('WhatsApp link carries the encoded text', () => {
    assert.equal(whatsappLink('a b\nc&d'), 'https://wa.me/?text=a%20b%0Ac%26d');
});
