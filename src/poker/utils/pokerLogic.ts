// src/poker/utils/pokerLogic.ts
import type { PokerPlayer, Pot } from '../types/pokerGameTypes';

/**
 * Calculates and distributes the main pot and any side pots.
 * This is a complex piece of logic central to correct poker game management.
 */
export const calculatePots = (players: PokerPlayer[]): Pot[] => {
    const allInPlayers = players
        .filter(p => p.isAllIn && p.totalPotContribution > 0)
        .sort((a, b) => a.totalPotContribution - b.totalPotContribution);

    const pots: Pot[] = [];
    let lastPotLevel = 0;

    // Create side pots for each all-in level
    for (const allInPlayer of allInPlayers) {
        const potLevel = allInPlayer.totalPotContribution;
        if (potLevel <= lastPotLevel) continue;

        const potAmount = players.reduce((sum, p) => {
            const contribution = Math.min(p.totalPotContribution, potLevel) - lastPotLevel;
            return sum + Math.max(0, contribution);
        }, 0);

        if (potAmount > 0) {
            const eligiblePlayers = new Set(
                players.filter(p => p.totalPotContribution >= potLevel && p.inHand).map(p => p.id)
            );
            pots.push({ amount: potAmount, eligiblePlayers });
        }
        lastPotLevel = potLevel;
    }

    // Create the main pot with the remaining bets
    const mainPotAmount = players.reduce((sum, p) => {
        return sum + Math.max(0, p.totalPotContribution - lastPotLevel);
    }, 0);

    if (mainPotAmount > 0) {
        const eligiblePlayers = new Set(
            players.filter(p => !p.isAllIn && p.inHand).map(p => p.id)
        );
        // If all remaining players are all-in, the last side pot is effectively the main pot.
        // This logic handles that by finding who is eligible from the last pot level.
        if (eligiblePlayers.size === 0) {
            const lastPotContributers = new Set(
                players.filter(p => p.totalPotContribution > lastPotLevel && p.inHand).map(p => p.id)
            );
            pots.push({ amount: mainPotAmount, eligiblePlayers: lastPotContributers });

        } else {
            pots.push({ amount: mainPotAmount, eligiblePlayers });
        }
    }


    // Filter out empty pots
    return pots.filter(p => p.amount > 0);
};