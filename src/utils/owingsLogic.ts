// src/utils/owingsLogic.ts
import { toTitleCase } from './formatters.ts';
import { paise } from './money.ts';
import type { Entity } from '../types/gameTypes';

export interface Transaction {
    from: string;
    to: string;
    amount: number;
    toPhone: string | null; // the payee's phone for UPI; null for a group or a payee without a phone
}

export interface OwingsPlayer {
    name: string;
    phoneNumber?: string;
    stack?: number;
    balance?: number;
    totalBuyIn?: number;
    entityId?: number;
    key?: string; // overrides the party key (the house)
}

// One person in a settlement: their key, display label, first-listed name, phone and net.
export interface Person {
    key: string;
    label: string;
    title: string;
    phone: string | null;
    net: number;
}

export const HOUSE_KEY = 'house';

// A person is their phone plus name when the phone is known (blank counts as none), else their name.
// Only identical keys merge, so two people sharing one phone in an old save stay apart.
export const partyKey = (name: string, phone?: string | null) =>
    phone?.trim() ? `${phone.trim()}|${toTitleCase(name)}` : `name:${toTitleCase(name)}`;

// The phone in a party key, or null for a name key, a group or the house.
export const phoneOfKey = (key: string) => (key.includes('|') ? key.split('|')[0] : null);

// A label still shared after the other rules gets " (2)", " (3)", … in first-seen order, skipping labels in use.
const numberRepeats = (labels: string[]) => {
    const used = new Set(labels);
    const last = new Map<string, number>();
    return labels.map(label => {
        if (!last.has(label)) {
            last.set(label, 1);
            return label;
        }
        let n = last.get(label)!;
        let candidate: string;
        do candidate = `${label} (${++n})`; while (used.has(candidate));
        last.set(label, n);
        used.add(candidate);
        return candidate;
    });
};

// Whole paise per party by largest remainder (floors, then the leftover paise to the largest fractions,
// first-seen on a tie), so nets that balance stay balanced however the floats fell.
const toCents = (nets: number[]) => {
    const scaled = nets.map(n => n * 100);
    const cents = scaled.map(Math.floor);
    let leftover = paise(nets.reduce((a, b) => a + b, 0)) - cents.reduce((a, b) => a + b, 0);
    const byFraction = scaled.map((_, i) => i).sort((a, b) => (scaled[b] - cents[b]) - (scaled[a] - cents[a]) || a - b);
    for (const i of byFraction) {
        if (leftover <= 0) break;
        cents[i]++;
        leftover--;
    }
    return cents;
};

// Each key's first-listed name. When names collide, people with a phone get " (…<last 4 digits>)",
// or the full phone when two of them share those digits.
export const partyLabels = (people: { key: string; name: string; phone?: string | null }[]): Record<string, string> => {
    const first = new Map<string, { name: string; phone: string }>();
    people.forEach(p => { if (!first.has(p.key)) first.set(p.key, { name: toTitleCase(p.name), phone: p.phone?.trim() ?? '' }); });
    const all = [...first.values()];
    const labels = [...first.values()].map(me => {
        const namesakes = all.filter(o => o !== me && o.name === me.name);
        if (!me.phone || namesakes.length === 0) return me.name;
        const sharedDigits = namesakes.some(o => o.phone && o.phone.slice(-4) === me.phone.slice(-4));
        return sharedDigits ? `${me.name} (${me.phone})` : `${me.name} (…${me.phone.slice(-4)})`;
    });
    const numbered = numberRepeats(labels);
    return Object.fromEntries([...first.keys()].map((key, i) => [key, numbered[i]]));
};

const keyOf = (p: OwingsPlayer) => p.key ?? partyKey(p.name, p.phoneNumber);
const netOf = (p: OwingsPlayer) => (p.stack ?? p.balance ?? 0) - (p.totalBuyIn ?? 0);

// People merged by key, and the fewest transfers between parties: members of a known group settle as
// the group, which never merges with a player. Parties keep first-seen order (a group at its first member).
export const settleParties = (players: OwingsPlayer[], entities: Entity[] = []) => {
    const labels = partyLabels(players.map(p => ({ key: keyOf(p), name: p.name, phone: p.phoneNumber })));
    const people = new Map<string, Person>();
    const parties = new Map<string, { label: string; phone: string | null; net: number; order: number }>();
    const personLabels = new Set(Object.values(labels));
    for (const p of players) {
        const key = keyOf(p);
        const phone = p.key ? null : p.phoneNumber?.trim() || null;
        const person = people.get(key) ?? people.set(key, { key, label: labels[key], title: toTitleCase(p.name), phone, net: 0 }).get(key)!;
        person.net += netOf(p);
        const group = p.entityId === undefined ? undefined : entities.find(e => e.id === p.entityId);
        const groupName = group && toTitleCase(group.name);
        const partyId = group ? `group:${group.id}` : key;
        const party = parties.get(partyId) ?? parties.set(partyId, {
            label: groupName ? (personLabels.has(groupName) ? `${groupName} (group)` : groupName) : labels[key],
            phone: group ? null : phone,
            net: 0,
            order: parties.size,
        }).get(partyId)!;
        party.net += netOf(p);
    }

    const list = [...parties.values()];
    numberRepeats(list.map(p => p.label)).forEach((label, i) => { list[i].label = label; });
    // offBy: what no transfer can cover when the nets don't sum to zero (carried-in balances).
    const offBy = paise(list.reduce((sum, p) => sum + p.net, 0)) / 100;
    const settled = list.map(({ label, phone, net }): Party => ({ label, phone, net }));
    return { transactions: fewestTransfers(settled), people: [...people.values()], parties: settled, offBy };
};

// Fewest transfers between parties, matched in whole paise, each side by amount ascending; equal amounts keep party order.
export const fewestTransfers = (list: Party[]): Transaction[] => {
    const byAmount = (a: { cents: number; order: number }, b: { cents: number; order: number }) => a.cents - b.cents || a.order - b.order;
    const cents = toCents(list.map(p => p.net));
    const debtors = list.map((p, i) => ({ ...p, cents: -cents[i], order: i })).filter(p => p.cents > 0).sort(byAmount);
    const creditors = list.map((p, i) => ({ ...p, cents: cents[i], order: i })).filter(p => p.cents > 0).sort(byAmount);
    const transactions: Transaction[] = [];
    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
        const cents = Math.min(debtors[d].cents, creditors[c].cents);
        transactions.push({ from: debtors[d].label, to: creditors[c].label, amount: cents / 100, toPhone: creditors[c].phone });
        debtors[d].cents -= cents;
        creditors[c].cents -= cents;
        if (debtors[d].cents === 0) d++;
        if (creditors[c].cents === 0) c++;
    }
    return transactions;
};

// The stored "Through <label>" when that label is still a party, else fewest transfers.
export const settledTransfers = (parties: Party[], through: string | null | undefined) => {
    const hub = through ? parties.findIndex(p => p.label === through) : -1;
    return hub < 0 ? fewestTransfers(parties) : throughTransfers(parties, hub);
};

export interface Party {
    label: string;
    phone: string | null;
    net: number;
}

// "Through <hub>": the others settle with the hub alone, payers first, then payees, each in party order.
// Amounts are the same whole paise as fewest transfers.
export const throughTransfers = (parties: Party[], hub: number): Transaction[] => {
    const cents = toCents(parties.map(p => p.net));
    const others = parties.map((p, i) => ({ p, cents: cents[i] })).filter((_, i) => i !== hub);
    const to = parties[hub];
    return [
        ...others.filter(o => o.cents < 0).map(o => ({ from: o.p.label, to: to.label, amount: -o.cents / 100, toPhone: to.phone })),
        ...others.filter(o => o.cents > 0).map(o => ({ from: to.label, to: o.p.label, amount: o.cents / 100, toPhone: o.p.phone })),
    ];
};
