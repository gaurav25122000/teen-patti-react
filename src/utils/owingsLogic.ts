// src/utils/owingsLogic.ts
import { toTitleCase } from './formatters';

interface PlayerBalance {
    name: string;
    net: number; // Positive if they are owed money, negative if they owe money
}

export interface Transaction {
    from: string;
    to: string;
    amount: number;
}

export const calculateOwings = (players: { name: string; stack?: number; balance?: number; totalBuyIn?: number }[]): Transaction[] => {
    // 1. Calculate Net Balance for each player
    const balances: PlayerBalance[] = players.map(p => {
        const currentAmount = p.stack ?? p.balance ?? 0;
        const investedAmount = p.totalBuyIn ?? (p.stack !== undefined ? p.totalBuyIn : 0); // Handle Teen Patti case where buy-in isn't tracked
        return {
            name: toTitleCase(p.name),
            net: currentAmount - investedAmount,
        };
    });

    // 2. Separate into Debtors and Creditors
    const debtors = balances.filter(p => p.net < 0).map(p => ({ ...p, net: -p.net })); // Owed amounts are positive
    const creditors = balances.filter(p => p.net > 0);

    const transactions: Transaction[] = [];

    // 3. Simplify Transactions
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const amount = Math.min(debtor.net, creditor.net);

        transactions.push({
            from: debtor.name,
            to: creditor.name,
            amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
        });

        debtor.net -= amount;
        creditor.net -= amount;

        if (debtor.net === 0) {
            debtorIndex++;
        }
        if (creditor.net === 0) {
            creditorIndex++;
        }
    }

    return transactions;
};