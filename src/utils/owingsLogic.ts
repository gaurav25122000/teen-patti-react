// src/utils/owingsLogic.ts
import { toTitleCase } from './formatters.ts';
import type { Entity } from '../types/gameTypes';
import type { PlayerNet } from './nightStats.ts';

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

// A person is their phone when known, else their name; only identical keys are the same person.
export const partyKey = (name: string, phone?: string | null) => phone?.trim() || `name:${toTitleCase(name)}`;

// Each key's first-listed name; when names collide, people with a phone get " (…<last 4 digits>)".
export const partyLabels = (people: { key: string; name: string; phone?: string | null }[]): Record<string, string> => {
    const first = new Map<string, { name: string; phone: boolean }>();
    people.forEach(p => { if (!first.has(p.key)) first.set(p.key, { name: toTitleCase(p.name), phone: !!p.phone?.trim() }); });
    const uses = new Map<string, number>();
    first.forEach(({ name }) => uses.set(name, (uses.get(name) ?? 0) + 1));
    return Object.fromEntries([...first].map(([key, { name, phone }]) =>
        [key, phone && uses.get(name)! > 1 ? `${name} (…${key.slice(-4)})` : name]));
};

const keyOf = (p: OwingsPlayer) => p.key ?? partyKey(p.name, p.phoneNumber);
const netOf = (p: OwingsPlayer) => (p.stack ?? p.balance ?? 0) - (p.totalBuyIn ?? 0);

// Label per player, the same labels the settlement uses (night stats are keyed by them).
export const playerLabels = (players: OwingsPlayer[]) => {
    const labels = partyLabels(players.map(p => ({ key: keyOf(p), name: p.name, phone: p.phoneNumber })));
    return (p: OwingsPlayer) => labels[keyOf(p)];
};

// People merged by key (for stats and history), and the fewest transfers between parties:
// members of a known group settle as the group, which never merges with a player.
export const settleParties = (players: OwingsPlayer[], entities: Entity[] = []) => {
    const label = playerLabels(players);
    const people = new Map<string, PlayerNet & { key: string }>();
    const parties = new Map<string, { label: string; phone: string | null; net: number }>();
    const personLabels = new Set(players.map(label));
    for (const p of players) {
        const key = keyOf(p);
        const person = people.get(key) ?? people.set(key, { key, name: label(p), net: 0 }).get(key)!;
        person.net += netOf(p);
        const group = p.entityId === undefined ? undefined : entities.find(e => e.id === p.entityId);
        const groupName = group && toTitleCase(group.name);
        const partyId = group ? `group:${group.id}` : key;
        const party = parties.get(partyId) ?? parties.set(partyId, {
            label: groupName ? (personLabels.has(groupName) ? `${groupName} (group)` : groupName) : label(p),
            phone: group ? null : p.phoneNumber?.trim() || null,
            net: 0,
        }).get(partyId)!;
        party.net += netOf(p);
    }

    const list = [...parties.values()];
    const debtors = list.filter(p => p.net < -0.005).map(p => ({ ...p, net: -p.net }));
    const creditors = list.filter(p => p.net > 0.005).map(p => ({ ...p }));
    const transactions: Transaction[] = [];
    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
        const amount = Math.min(debtors[d].net, creditors[c].net);
        transactions.push({ from: debtors[d].label, to: creditors[c].label, amount: Math.round(amount * 100) / 100, toPhone: creditors[c].phone });
        debtors[d].net -= amount;
        creditors[c].net -= amount;
        if (debtors[d].net < 0.005) d++;
        if (creditors[c].net < 0.005) c++;
    }
    return { transactions, people: [...people.values()] };
};
