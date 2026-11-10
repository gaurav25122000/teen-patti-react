import { fewestTransfers, throughTransfers, type Party, type Transaction } from './owingsLogic.ts';
import { paise } from './money.ts';

// Used by tests: nobody pays themselves, no transfer is ₹0 or to a non-party, and every party's transfers cover its
// net to under a paisa, except the shortfall the nets leave (offBy), on its side. Returns the first problem, or null.
export const settlementProblem = (parties: { label: string; net: number }[], transactions: Transaction[], offBy: number): string | null => {
    const labels = new Set(parties.map(p => p.label));
    for (const t of transactions) {
        if (t.from === t.to) return `${t.from} pays themselves`;
        if (paise(t.amount) < 1) return `₹${t.amount} transfer from ${t.from}`;
        if (!labels.has(t.from) || !labels.has(t.to)) return `${t.from} pays ${t.to}: not a party`;
    }
    for (const p of parties) {
        const flow = transactions.reduce((sum, t) => sum + (t.to === p.label ? paise(t.amount) : 0) - (t.from === p.label ? paise(t.amount) : 0), 0);
        const gap = p.net * 100 - flow; // paise
        if (Math.abs(gap) > 1 - 1e-6 && Math.sign(gap) !== Math.sign(offBy)) return `${p.label}: net ${p.net}, transfers ${flow / 100}`;
    }
    return null;
};

// The shown transfers, fewest transfers, then "Through" each party in turn.
export const everyModeProblem = ({ parties, transactions, offBy }: { parties: Party[]; transactions: Transaction[]; offBy: number }) =>
    [transactions, fewestTransfers(parties), ...parties.map((_, i) => throughTransfers(parties, i))]
        .map(t => settlementProblem(parties, t, offBy)).find(Boolean) ?? null;
