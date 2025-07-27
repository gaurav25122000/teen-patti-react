// src/utils/owingsLogic.ts
import { toTitleCase } from './formatters';
import type { Entity } from '../types/gameTypes';

interface PlayerBalance {
    name: string;
    net: number; // Positive if they are owed money, negative if they owe money
}

export interface Transaction {
    from: string;
    to: string;
    amount: number;
}

export const calculateOwings = (
    players: { name: string; stack?: number; balance?: number; totalBuyIn?: number; entityId?: number }[],
    entities: Entity[] = []
): Transaction[] => {

    // Group players by entity
    const entityBalances: { [key: number]: PlayerBalance[] } = {};
    players.forEach(p => {
        if (p.entityId) {
            if (!entityBalances[p.entityId]) {
                entityBalances[p.entityId] = [];
            }
            entityBalances[p.entityId].push({
                name: toTitleCase(p.name),
                net: (p.stack ?? p.balance ?? 0) - (p.totalBuyIn ?? (p.stack !== undefined ? p.totalBuyIn : 0)),
            });
        }
    });

    const aggregatedBalances: PlayerBalance[] = [];

    // Add individual players (not in any entity)
    players.forEach(p => {
        if (!p.entityId) {
            aggregatedBalances.push({
                name: toTitleCase(p.name),
                net: (p.stack ?? p.balance ?? 0) - (p.totalBuyIn ?? (p.stack !== undefined ? p.totalBuyIn : 0)),
            });
        }
    });

    // Add aggregated entity balances
    for (const entityId in entityBalances) {
        const entity = entities.find(e => e.id === Number(entityId));
        if (entity) {
            const totalNet = entityBalances[entityId].reduce((sum, p) => sum + p.net, 0);
            aggregatedBalances.push({
                name: toTitleCase(entity.name),
                net: totalNet,
            });
        }
    }

    // 2. Separate into Debtors and Creditors
    const debtors = aggregatedBalances.filter(p => p.net < 0).map(p => ({ ...p, net: -p.net })); // Owed amounts are positive
    const creditors = aggregatedBalances.filter(p => p.net > 0);

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