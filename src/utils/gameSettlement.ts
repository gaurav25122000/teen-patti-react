import { calculateOwings } from './owingsLogic.ts';
import { toTitleCase } from './formatters.ts';
import type { GameState } from '../types/gameTypes.ts';
import type { PokerGameState } from '../poker/types/pokerGameTypes.ts';
import type { BlackjackGameState } from '../blackjack/types/blackjackGameTypes.ts';

// Final Owings and history entries start from these per-player nets. An unfinished round is voided:
// chips in the pot go back to their owners (Final Owings only runs between rounds, where this changes nothing).

export const teenPattiSettlement = (state: Pick<GameState, 'players' | 'entities' | 'roundActive' | 'roundContributions'>) => {
    const players = state.players.map(p => ({
        ...p,
        balance: p.balance + (state.roundActive ? state.roundContributions.get(p.id) ?? 0 : 0),
        totalBuyIn: 0,
    }));
    return {
        nets: players.map(p => ({ name: toTitleCase(p.name), net: p.balance })),
        transactions: calculateOwings(players, state.entities),
    };
};

// Mid-hand, pots already paid out this hand are taken back too.
export const pokerSettlement = (state: Pick<PokerGameState, 'players'>) => {
    const players = state.players.map(p => ({ ...p, stack: p.stack + p.totalPotContribution - (p.roundWinnings ?? 0) }));
    return {
        nets: players.map(p => ({ name: toTitleCase(p.name), net: p.stack - p.totalBuyIn })),
        transactions: calculateOwings(players),
    };
};

// The house is in the transactions, not in the player nets.
export const blackjackSettlement = (state: Pick<BlackjackGameState, 'players' | 'dealerNet'>) => ({
    nets: state.players.map(p => ({ name: toTitleCase(p.name), net: p.stack - p.totalBuyIn })),
    transactions: calculateOwings([...state.players, { name: 'Dealer (House)', stack: state.dealerNet, totalBuyIn: 0 }]),
});
