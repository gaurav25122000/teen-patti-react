import type { Transaction } from './owingsLogic.ts';
import { paise } from './money.ts';

// Used by tests: nobody pays themselves, no transfer is ₹0, and every party's transfers cover its net in
// paise except what the nets themselves leave over (offBy), all on one side. Returns the first problem, or null.
export const settlementProblem = (parties: { label: string; net: number }[], transactions: Transaction[], offBy: number): string | null => {
    for (const t of transactions) {
        if (t.from === t.to) return `${t.from} pays themselves`;
        if (paise(t.amount) < 1) return `₹${t.amount} transfer from ${t.from}`;
    }
    let left = 0;
    for (const p of parties) {
        const flow = transactions.reduce((sum, t) => sum + (t.to === p.label ? paise(t.amount) : 0) - (t.from === p.label ? paise(t.amount) : 0), 0);
        const gap = paise(p.net) - flow;
        if (gap !== 0 && Math.sign(gap) !== Math.sign(paise(offBy))) return `${p.label}: net ${p.net}, transfers ${flow / 100}`;
        left += gap;
    }
    return left === paise(offBy) ? null : `uncovered ${left / 100}, nets off by ${offBy}`;
};
