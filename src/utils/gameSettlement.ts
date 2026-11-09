import { HOUSE_KEY, settleParties, type OwingsPlayer, type Person } from './owingsLogic.ts';
import type { Entity, GameState } from '../types/gameTypes.ts';
import type { Departure } from './departures.ts';
import type { PokerGameState } from '../poker/types/pokerGameTypes.ts';
import type { BlackjackGameState } from '../blackjack/types/blackjackGameTypes.ts';
import { chipsWithBets } from '../blackjack/engine.ts';

// Final Owings and history entries start from these nets. Chips still in play go back to their owners:
// Teen Patti's pot, a Poker hand's pot (less pots already paid), Blackjack's unsettled bets.

const settle = (players: OwingsPlayer[], entities: Entity[] = [], carried: boolean | undefined = false) => ({ ...settleParties(players, entities), carried });

export type Settlement = ReturnType<typeof settle>;

// Departures settle after the players at the table, in the order they left.
const leavers = (departed: Departure[] | undefined) =>
    (departed ?? []).map(d => ({ name: d.name, phoneNumber: d.phone, entityId: d.entityId, balance: d.net }));

// Per-player nets for display (the house is a payee, not a player).
export const playerNets = (people: Person[]) => people.filter(p => p.key !== HOUSE_KEY).map(p => ({ name: p.label, net: p.net }));

export const teenPattiSettlement = (state: Pick<GameState, 'players' | 'entities' | 'roundActive' | 'roundContributions' | 'carriedIn' | 'departed'>) => {
    const players = state.players.map(p => ({
        ...p,
        balance: p.balance + (state.roundActive ? state.roundContributions.get(p.id) ?? 0 : 0),
        totalBuyIn: 0,
    }));
    return settle([...players, ...leavers(state.departed)], state.entities, state.carriedIn);
};

// Mid-hand, pots already paid out this hand are taken back too.
export const pokerSettlement = (state: Pick<PokerGameState, 'players' | 'departed'>) =>
    settle([...state.players.map(p => ({ ...p, stack: p.stack + p.totalPotContribution - (p.roundWinnings ?? 0) })), ...leavers(state.departed)]);

// The house is in the transactions and people, not in the player nets.
export const blackjackSettlement = (state: Pick<BlackjackGameState, 'players' | 'dealerNet' | 'departed'>) => settle([
    ...state.players.map(p => ({ ...p, stack: chipsWithBets(p) })),
    ...leavers(state.departed),
    { key: HOUSE_KEY, name: 'Dealer (House)', stack: state.dealerNet, totalBuyIn: 0 },
]);
