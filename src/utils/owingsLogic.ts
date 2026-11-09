// src/utils/owingsLogic.ts
import { toTitleCase } from './formatters.ts';
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

// A person is their phone when known (blank counts as none), else their name; only identical keys merge.
export const partyKey = (name: string, phone?: string | null) => phone?.trim() || `name:${toTitleCase(name)}`;

// Each key's first-listed name. When names collide, people with a phone get " (…<last 4 digits>)",
// or the full phone when two of them share those digits.
export const partyLabels = (people: { key: string; name: string; phone?: string | null }[]): Record<string, string> => {
    const first = new Map<string, { name: string; phone: string }>();
    people.forEach(p => { if (!first.has(p.key)) first.set(p.key, { name: toTitleCase(p.name), phone: p.phone?.trim() ?? '' }); });
    const all = [...first.values()];
    return Object.fromEntries([...first].map(([key, me]) => {
        const namesakes = all.filter(o => o !== me && o.name === me.name);
        if (!me.phone || namesakes.length === 0) return [key, me.name];
        const sharedDigits = namesakes.some(o => o.phone && o.phone.slice(-4) === me.phone.slice(-4));
        return [key, sharedDigits ? `${me.name} (${me.phone})` : `${me.name} (…${me.phone.slice(-4)})`];
    }));
};

const keyOf = (p: OwingsPlayer) => p.key ?? partyKey(p.name, p.phoneNumber);
const netOf = (p: OwingsPlayer) => (p.stack ?? p.balance ?? 0) - (p.totalBuyIn ?? 0);
const paise = (amount: number) => Math.round(amount * 100);

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

    // Each side by amount ascending; equal amounts keep first-seen order.
    const byAmount = (a: { net: number; order: number }, b: { net: number; order: number }) => paise(a.net) - paise(b.net) || a.order - b.order;
    const list = [...parties.values()];
    const debtors = list.filter(p => p.net < -0.005).map(p => ({ ...p, net: -p.net })).sort(byAmount);
    const creditors = list.filter(p => p.net > 0.005).map(p => ({ ...p })).sort(byAmount);
    const transactions: Transaction[] = [];
    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
        const amount = Math.min(debtors[d].net, creditors[c].net);
        transactions.push({ from: debtors[d].label, to: creditors[c].label, amount: paise(amount) / 100, toPhone: creditors[c].phone });
        debtors[d].net -= amount;
        creditors[c].net -= amount;
        if (debtors[d].net < 0.005) d++;
        if (creditors[c].net < 0.005) c++;
    }
    return { transactions, people: [...people.values()] };
};
