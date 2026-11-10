import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackjackSettlement, playerNets, pokerSettlement, teenPattiSettlement } from './gameSettlement.ts';
import { partyKey, partyLabels, settleParties, throughTransfers } from './owingsLogic.ts';

const tpPlayer = (id: number, name: string, balance: number, phoneNumber?: string, more = {}) =>
    ({ id, name, balance, phoneNumber, isTakingBreak: false, ...more });
const tp = (players: ReturnType<typeof tpPlayer>[], more = {}) =>
    ({ players, entities: [], roundActive: false, roundContributions: new Map<number, number>(), ...more });
const nets = (s: { people: Parameters<typeof playerNets>[0] }) => playerNets(s.people);

test('a person is their phone when known (blank is none), else their name', () => {
    assert.equal(partyKey('raj', ' 9000000002 '), '9000000002|Raj');
    assert.equal(partyKey(' raj ', '   '), 'name:Raj');
    assert.equal(partyKey('raj', null), 'name:Raj');
});

test('labels: first-listed name per key; namesakes with a phone get the last 4 digits, phoneless keep the name', () => {
    assert.deepEqual(partyLabels([
        { key: '9000000002', name: 'raj', phone: '9000000002' },
        { key: '9000001234', name: 'Raj', phone: '9000001234' },
        { key: 'name:Raj', name: 'RAJ' },
        { key: '9000000002', name: 'Rajesh', phone: '9000000002' },
        { key: '9000000005', name: 'Asha', phone: '9000000005' },
    ]), { '9000000002': 'Raj (…0002)', '9000001234': 'Raj (…1234)', 'name:Raj': 'Raj', '9000000005': 'Asha' });
});

test('labels: namesakes whose phones end alike show the full phone', () => {
    assert.deepEqual(partyLabels([
        { key: '9000001234', name: 'Raj', phone: '9000001234' },
        { key: '8000001234', name: 'Raj', phone: '8000001234' },
        { key: '7000000002', name: 'Raj', phone: '7000000002' },
    ]), { '9000001234': 'Raj (9000001234)', '8000001234': 'Raj (8000001234)', '7000000002': 'Raj (…0002)' });
});

test('teen patti between rounds: nets are balances, transfers carry the payee phone', () => {
    const s = teenPattiSettlement(tp([tpPlayer(1, 'asha', 20, '9000000001'), tpPlayer(2, 'Raj', -20, '9000000002')]));
    assert.deepEqual(nets(s), [{ name: 'Asha', net: 20 }, { name: 'Raj', net: -20 }]);
    assert.deepEqual(s.transactions, [{ from: 'Raj', to: 'Asha', amount: 20, toPhone: '9000000001' }]);
    assert.equal(s.carried, false);
});

test('teen patti: the carried-in flag rides along; transfers and nets keep the carried balances', () => {
    const s = teenPattiSettlement(tp([tpPlayer(1, 'Asha', 150, '9000000001'), tpPlayer(2, 'Raj', -150, '9000000002')], { carriedIn: true }));
    assert.equal(s.carried, true);
    assert.deepEqual(s.transactions, [{ from: 'Raj', to: 'Asha', amount: 150, toPhone: '9000000001' }]);
});

test('teen patti mid-round: the unfinished round is voided, so nets still sum to 0', () => {
    const s = teenPattiSettlement(tp(
        [tpPlayer(1, 'Asha', 10), tpPlayer(2, 'Raj', -20), tpPlayer(3, 'Dev', -20)],
        { roundActive: true, roundContributions: new Map([[1, 10], [2, 10], [3, 10]]) }
    ));
    assert.deepEqual(nets(s), [{ name: 'Asha', net: 20 }, { name: 'Raj', net: -10 }, { name: 'Dev', net: -10 }]);
    assert.deepEqual(s.transactions, [{ from: 'Raj', to: 'Asha', amount: 10, toPhone: null }, { from: 'Dev', to: 'Asha', amount: 10, toPhone: null }]);
});

test('namesakes with different phones never net out; one phone and one name is one person, a different name is not', () => {
    const split = teenPattiSettlement(tp([tpPlayer(1, 'Raj', 500, '9000000001'), tpPlayer(2, 'raj', -500, '9000000002')]));
    assert.deepEqual(nets(split), [{ name: 'Raj (…0001)', net: 500 }, { name: 'Raj (…0002)', net: -500 }]);
    assert.deepEqual(split.transactions, [{ from: 'Raj (…0002)', to: 'Raj (…0001)', amount: 500, toPhone: '9000000001' }]);
    const same = teenPattiSettlement(tp([tpPlayer(1, 'Raj', -30, '9000000002'), tpPlayer(2, 'Asha', 50, '9000000001'), tpPlayer(3, 'raj', -20, '9000000002')]));
    assert.deepEqual(nets(same), [{ name: 'Raj', net: -50 }, { name: 'Asha', net: 50 }]);
    assert.deepEqual(same.transactions, [{ from: 'Raj', to: 'Asha', amount: 50, toPhone: '9000000001' }]);
    // Two people on one phone in an old save stay apart.
    const shared = teenPattiSettlement(tp([tpPlayer(1, 'Raj', -30, '9000000002'), tpPlayer(2, 'Asha', 50, '9000000001'), tpPlayer(3, 'Rajesh', -20, '9000000002')]));
    assert.deepEqual(nets(shared), [{ name: 'Raj', net: -30 }, { name: 'Asha', net: 50 }, { name: 'Rajesh', net: -20 }]);
    assert.deepEqual(shared.transactions, [{ from: 'Rajesh', to: 'Asha', amount: 20, toPhone: '9000000001' }, { from: 'Raj', to: 'Asha', amount: 30, toPhone: '9000000001' }]);
});

test('transfers: each side by amount ascending, ties in first-seen order', () => {
    const { transactions } = settleParties([
        { name: 'A', phoneNumber: '1', balance: 100 }, { name: 'B', phoneNumber: '2', balance: 30 },
        { name: 'C', phoneNumber: '3', balance: -80 }, { name: 'D', phoneNumber: '4', balance: -50 },
    ]);
    assert.deepEqual(transactions, [
        { from: 'D', to: 'B', amount: 30, toPhone: '2' },
        { from: 'D', to: 'A', amount: 20, toPhone: '1' },
        { from: 'C', to: 'A', amount: 80, toPhone: '1' },
    ]);
});

test('a group sits at its first member\'s place among the parties', () => {
    const { transactions } = settleParties([
        { name: 'P1', phoneNumber: '1', balance: -50, entityId: 7 }, { name: 'X', phoneNumber: '2', balance: -50 },
        { name: 'P2', phoneNumber: '3', balance: 0, entityId: 7 }, { name: 'Y', phoneNumber: '4', balance: 100 },
    ], [{ id: 7, name: 'Team' }]);
    assert.deepEqual(transactions.map(t => t.from), ['Team', 'X']);
});

test('a group settles as itself, never merges with a player, and is marked when names collide; no phone for a group', () => {
    const s = teenPattiSettlement(tp([
        tpPlayer(1, 'Sharma', 100, '9000000001'),
        tpPlayer(2, 'Priya', -60, '9000000002', { entityId: 7 }),
        tpPlayer(3, 'Dev', -40, '9000000003', { entityId: 7 }),
    ], { entities: [{ id: 7, name: 'sharma' }] }));
    assert.deepEqual(s.transactions, [{ from: 'Sharma (group)', to: 'Sharma', amount: 100, toPhone: '9000000001' }]);
    assert.deepEqual(nets(s).map(n => n.name), ['Sharma', 'Priya', 'Dev']);
});

test('a group that is owed money has no phone, so no PAY', () => {
    const { transactions } = teenPattiSettlement(tp([
        tpPlayer(1, 'Priya', 60, '9000000002', { entityId: 7 }),
        tpPlayer(2, 'Dev', -60, '9000000003'),
    ], { entities: [{ id: 7, name: 'Team A' }] }));
    assert.deepEqual(transactions, [{ from: 'Dev', to: 'Team A', amount: 60, toPhone: null }]);
});

test('a player whose group no longer exists is settled on their own', () => {
    const { transactions } = teenPattiSettlement(tp([tpPlayer(1, 'Raj', -100, '9000000002', { entityId: 99 }), tpPlayer(2, 'Asha', 100, '9000000001')]));
    assert.deepEqual(transactions, [{ from: 'Raj', to: 'Asha', amount: 100, toPhone: '9000000001' }]);
});

test('poker mid-hand: chips in the pot go back and pots already paid this hand are taken back', () => {
    const seat = (name: string, stack: number, totalPotContribution: number, roundWinnings: number) =>
        ({ name, stack, totalBuyIn: 1000, totalPotContribution, roundWinnings });
    const s = pokerSettlement({ players: [seat('Asha', 1300, 200, 400), seat('Raj', 800, 200, 0)] as never });
    assert.deepEqual(nets(s), [{ name: 'Asha', net: 100 }, { name: 'Raj', net: 0 }]);
});

const bjHand = (status: string, wager: number, extra = {}) => ({ id: 'h', cards: [], bet: wager, wager, status, hasHit: false, ...extra });

test('blackjack: the house is in the transactions and people, not in the player nets, and has no phone', () => {
    const s = blackjackSettlement({ players: [{ name: 'Raj', stack: 700, totalBuyIn: 1000, phoneNumber: '9000000002', hands: [] }] as never, dealerNet: 300 });
    assert.deepEqual(nets(s), [{ name: 'Raj', net: -300 }]);
    assert.deepEqual(s.transactions, [{ from: 'Raj', to: 'Dealer (house)', amount: 300, toPhone: null }]);
    assert.deepEqual(s.people.map(p => [p.key, p.net]), [['9000000002|Raj', -300], ['house', 300]]);
});

test('blackjack: a player named like the house stays a separate party', () => {
    const { transactions } = blackjackSettlement({ players: [{ name: 'dealer (house)', stack: 1100, totalBuyIn: 1000, phoneNumber: '9000000004', hands: [] }] as never, dealerNet: -100 });
    assert.deepEqual(transactions, [{ from: 'Dealer (house)', to: 'Dealer (house) (…0004)', amount: 100, toPhone: '9000000004' }]);
});

test('a phoneless player named like the house is still not the house; the house is numbered', () => {
    const s = blackjackSettlement({ players: [{ name: 'Dealer (House)', stack: 1100, totalBuyIn: 1000, hands: [] }] as never, dealerNet: -100 });
    assert.deepEqual(nets(s), [{ name: 'Dealer (house)', net: 100 }]);
    assert.deepEqual(s.transactions, [{ from: 'Dealer (house) (2)', to: 'Dealer (house)', amount: 100, toPhone: null }]);
});

test('two groups with one name are numbered in first-seen order', () => {
    const { transactions } = settleParties([
        { name: 'P1', phoneNumber: '1', balance: -50, entityId: 1 },
        { name: 'P2', phoneNumber: '2', balance: 50, entityId: 2 },
    ], [{ id: 1, name: 'Team' }, { id: 2, name: 'team' }]);
    assert.deepEqual(transactions, [{ from: 'Team', to: 'Team (2)', amount: 50, toPhone: null }]);
});

test('nets that do not sum to zero report what no transfer covers', () => {
    const s = settleParties([
        { name: 'Asha', phoneNumber: '1', balance: 500 }, { name: 'Raj', phoneNumber: '2', balance: -200 }, { name: 'Dev', phoneNumber: '3', balance: 200 },
    ]);
    assert.equal(s.offBy, 500);
    assert.deepEqual(s.transactions, [{ from: 'Raj', to: 'Dev', amount: 200, toPhone: '3' }]);
    assert.equal(settleParties([{ name: 'A', phoneNumber: '1', balance: -10 }]).offBy, -10);
    assert.equal(settleParties([{ name: 'A', phoneNumber: '1', balance: 10 }, { name: 'B', phoneNumber: '2', balance: -10 }]).offBy, 0);
});

test('blackjack: unsettled bets go back to their owners; settled hands stay settled', () => {
    const s = blackjackSettlement({
        players: [
            { name: 'Asha', stack: 900, totalBuyIn: 1000, hands: [bjHand('playing', 100)] },
            { name: 'Raj', stack: 1050, totalBuyIn: 1000, phoneNumber: '9000000002', hands: [bjHand('win', 50), bjHand('stand', 20, { insurance: 10 })] },
        ] as never,
        dealerNet: -50,
    });
    assert.deepEqual(nets(s), [{ name: 'Asha', net: 0 }, { name: 'Raj', net: 80 }]);
    assert.deepEqual(s.transactions, [{ from: 'Dealer (house)', to: 'Raj', amount: 50, toPhone: '9000000002' }]);
});

test('transfers balance every party within a paisa and nobody pays themselves', () => {
    const players = [
        { name: 'A', phoneNumber: '1', balance: 0.1 + 0.2 }, { name: 'B', phoneNumber: '2', balance: -0.3 },
        { name: 'C', phoneNumber: '3', balance: 33.335 }, { name: 'D', phoneNumber: '4', balance: -33.335 },
    ];
    assert.deepEqual(settleParties(players).transactions, [{ from: 'B', to: 'A', amount: 0.3, toPhone: '1' }, { from: 'D', to: 'C', amount: 33.34, toPhone: '3' }]);
    assert.equal(settleParties(players).offBy, 0);
});

test('float residue on either side never makes a ₹0 transfer', () => {
    const players = [
        { name: 'A', phoneNumber: '1', balance: 0.3 }, { name: 'B', phoneNumber: '2', balance: -(0.1 + 0.2) },
        { name: 'C', phoneNumber: '3', balance: 10 }, { name: 'D', phoneNumber: '4', balance: -10 },
    ];
    assert.deepEqual(settleParties(players).transactions, [{ from: 'B', to: 'A', amount: 0.3, toPhone: '1' }, { from: 'D', to: 'C', amount: 10, toPhone: '3' }]);
});

test('a net under half a paisa is no party; half a paisa or more is paid as one paisa', () => {
    assert.deepEqual(settleParties([{ name: 'A', phoneNumber: '1', balance: 0.004 }, { name: 'B', phoneNumber: '2', balance: -0.004 }]).transactions, []);
    assert.deepEqual(settleParties([{ name: 'A', phoneNumber: '1', balance: 0.006 }, { name: 'B', phoneNumber: '2', balance: -0.006 }]).transactions,
        [{ from: 'B', to: 'A', amount: 0.01, toPhone: '1' }]);
});

test('halves of a paisa round away from zero on both sides, so they never make a false imbalance', () => {
    const s = settleParties([{ name: 'A', phoneNumber: '1', balance: 0.125 }, { name: 'B', phoneNumber: '2', balance: -0.125 }]);
    assert.deepEqual(s.transactions, [{ from: 'B', to: 'A', amount: 0.13, toPhone: '1' }]);
    assert.equal(s.offBy, 0);
});

test('largest-remainder paise: a ₹10.01 bet paid 3:2 balances exactly, never "off by ₹0.01"', () => {
    const s = blackjackSettlement({ players: [{ name: 'Asha', stack: 1000 + 10.01 * 1.5, totalBuyIn: 1000, phoneNumber: '9000000001', hands: [] }] as never, dealerNet: -10.01 * 1.5 });
    assert.equal(s.offBy, 0);
    // 15.015 is stored as 15.01499… for Asha and -15.015 for the house; the leftover paisa goes to the larger fraction.
    assert.deepEqual(s.transactions, [{ from: 'Dealer (house)', to: 'Asha', amount: 15.01, toPhone: '9000000001' }]);
});

test('numbering skips a label already in use', () => {
    const { transactions } = settleParties([
        { name: 'Team (2)', phoneNumber: '1', balance: 30 },
        { name: 'P1', phoneNumber: '2', balance: -50, entityId: 1 },
        { name: 'P2', phoneNumber: '3', balance: 20, entityId: 2 },
    ], [{ id: 1, name: 'Team' }, { id: 2, name: 'Team' }]);
    assert.deepEqual(transactions.map(t => [t.from, t.to]), [['Team', 'Team (3)'], ['Team', 'Team (2)']]);
});

test('settling through one person: payers pay the hub, then the hub pays each payee, in the same paise', () => {
    const parties = [
        { label: 'Asha', phone: '9000000001', net: 300 },
        { label: 'Raj', phone: '9000000002', net: -100 },
        { label: 'Dev', phone: null, net: -250 },
        { label: 'Mira', phone: '9000000004', net: 50 },
    ];
    const rows = (hub: number) => throughTransfers(parties, hub).map(t => [t.from, t.to, t.amount, t.toPhone]);
    assert.deepEqual(rows(1), [['Dev', 'Raj', 250, '9000000002'], ['Raj', 'Asha', 300, '9000000001'], ['Raj', 'Mira', 50, '9000000004']]);
    assert.deepEqual(rows(0), [['Raj', 'Asha', 100, '9000000001'], ['Dev', 'Asha', 250, '9000000001'], ['Asha', 'Mira', 50, '9000000004']]);
    const halves = [{ label: 'Asha', phone: null, net: 0.015 }, { label: 'Raj', phone: null, net: 0.015 }, { label: 'Dev', phone: null, net: -0.03 }];
    assert.deepEqual(throughTransfers(halves, 2).map(t => [t.to, t.amount]), [['Asha', 0.02], ['Raj', 0.01]]); // largest remainder, first-seen on a tie
});

test('a stored "Through <party>" drives the settlement (and so History); a hub no longer present falls back to fewest transfers', () => {
    const players = [tpPlayer(1, 'Asha', 30, '9000000001'), tpPlayer(2, 'Raj', -10, '9000000002'), tpPlayer(3, 'Dev', -20, '9000000003')];
    const rows = (through?: string | null) => teenPattiSettlement(tp(players, { settleThrough: through })).transactions.map(t => [t.from, t.to, t.amount]);
    assert.deepEqual(rows('Raj'), [['Dev', 'Raj', 20], ['Raj', 'Asha', 30]]);
    assert.deepEqual(rows(null), [['Raj', 'Asha', 10], ['Dev', 'Asha', 20]]);
    assert.deepEqual(rows('Mira'), rows(null));
});
