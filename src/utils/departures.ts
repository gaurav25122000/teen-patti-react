import { formatAmount, toTitleCase } from './formatters.ts';
import { partyKey } from './owingsLogic.ts';
import { cleanPhone } from './savedPlayers.ts';

// A removed player's result, kept so Final Owings, History and the summary still count it.
export interface Departure {
    name: string;
    phone?: string;
    entityId?: number; // Teen Patti groups
    net: number;
}

// Adds a leaver; one who left before (same person and group) has their nets summed. Under half a paisa isn't kept.
export const depart = (departed: Departure[] | undefined, leaver: Departure): Departure[] => {
    const list = departed ?? [];
    if (Math.abs(leaver.net) < 0.005) return list;
    const entry = { ...leaver, name: toTitleCase(leaver.name), phone: cleanPhone(leaver.phone) };
    const key = partyKey(entry.name, entry.phone);
    const index = list.findIndex(d => partyKey(d.name, d.phone) === key && d.entityId === entry.entityId);
    return index < 0 ? [...list, entry] : list.map((d, i) => (i === index ? { ...d, net: d.net + entry.net } : d));
};

export const departureNote = (net: number) =>
    Math.abs(net) < 0.005 ? '' : ` They leave ₹${formatAmount(Math.abs(net))} ${net > 0 ? 'up' : 'down'} and stay in Final Owings.`;

export const tooFewToRemove = (min: number) =>
    `Keep at least ${min} ${min === 1 ? 'player' : 'players'} at the table; use Final Owings to settle up.`;
