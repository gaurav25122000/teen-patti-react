import { settleParties, type OwingsPlayer } from './owingsLogic.ts';
import type { Entity, GameState } from '../types/gameTypes.ts';
import type { PokerGameState } from '../poker/types/pokerGameTypes.ts';
import type { BlackjackGameState } from '../blackjack/types/blackjackGameTypes.ts';

// Final Owings and history entries start from these nets. Chips still in play go back to their owners:
// Teen Patti's pot, a Poker hand's pot (less pots already paid), Blackjack's unsettled bets.

const HOUSE_KEY = 'house';

const settle = (players: OwingsPlayer[], entities: Entity[] = [], houseNet = 0, carried = false) => {
    const { transactions, people } = settleParties(players, entities);
    return { nets: people.filter(p => p.key !== HOUSE_KEY).map(({ name, net }) => ({ name, net })), transactions, houseNet, carried };
};

// 'tonight' leaves out balances carried in at setup or on joining: History and the night summary use it.
export const teenPattiSettlement = (
    state: Pick<GameState, 'players' | 'entities' | 'roundActive' | 'roundContributions'>,
    mode: 'live' | 'tonight' = 'live'
) => {
    const tonight = mode === 'tonight';
    const players = state.players.map(p => ({
        ...p,
        balance: p.balance + (state.roundActive ? state.roundContributions.get(p.id) ?? 0 : 0) - (tonight ? p.carriedIn ?? 0 : 0),
        totalBuyIn: 0,
    }));
    return settle(players, state.entities, 0, tonight && state.players.some(p => p.carriedIn !== undefined));
};

// Mid-hand, pots already paid out this hand are taken back too.
export const pokerSettlement = (state: Pick<PokerGameState, 'players'>) =>
    settle(state.players.map(p => ({ ...p, stack: p.stack + p.totalPotContribution - (p.roundWinnings ?? 0) })));

// The house is in the transactions, not in the player nets.
export const blackjackSettlement = (state: Pick<BlackjackGameState, 'players' | 'dealerNet'>) => {
    const players = state.players.map(p => ({
        ...p,
        stack: p.stack + p.hands.reduce((sum, h) => sum + (h.status === 'playing' || h.status === 'stand' ? h.wager : 0)
            + (h.insurance && !h.insuranceResult ? h.insurance : 0), 0),
    }));
    return settle([...players, { key: HOUSE_KEY, name: 'Dealer (House)', stack: state.dealerNet, totalBuyIn: 0 }], [], state.dealerNet);
};
