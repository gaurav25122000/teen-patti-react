import { HOUSE_KEY, settledTransfers, settleParties, type OwingsPlayer, type Person } from './owingsLogic.ts';
import type { Entity, GameState } from '../types/gameTypes.ts';
import type { Departure } from './departures.ts';
import type { PokerGameState } from '../poker/types/pokerGameTypes.ts';
import type { BlackjackGameState } from '../blackjack/types/blackjackGameTypes.ts';
import { chipsWithBets } from '../blackjack/engine.ts';
import { IN_PROGRESS, tournamentLine } from '../poker/tournament.ts';

// Final Owings and history entries start from these nets. Chips still in play go back to their owners:
// Teen Patti's pot, a Poker hand's pot (less pots already paid), Blackjack's unsettled bets.

// notice: shown instead of transfers; tournament: the summary's prizes line; startedAt: for the session lines;
// through: the game's stored "Through <party>", which History keeps too.
const settle = (players: OwingsPlayer[], entities: Entity[] = [], carried: boolean | undefined = false,
    { through, ...extra }: { notice?: string; tournament?: string; startedAt?: number; through?: string | null } = {}) => {
    const settled = settleParties(players, entities);
    return { ...settled, transactions: settledTransfers(settled.parties, through), carried, ...extra };
};

export type Settlement = ReturnType<typeof settle>;

// Departures settle after the players at the table, in the order they left.
const leavers = (departed: Departure[] | undefined) =>
    (departed ?? []).map(d => ({ name: d.name, phoneNumber: d.phone, entityId: d.entityId, balance: d.net }));

// Per-player nets for display (the house is a payee, not a player).
export const playerNets = (people: Person[]) => people.filter(p => p.key !== HOUSE_KEY).map(p => ({ name: p.label, net: p.net }));

export const teenPattiSettlement = (state: Pick<GameState, 'players' | 'entities' | 'roundActive' | 'roundContributions' | 'carriedIn' | 'departed' | 'startedAt' | 'settleThrough'>) => {
    const players = state.players.map(p => ({
        ...p,
        balance: p.balance + (state.roundActive ? state.roundContributions.get(p.id) ?? 0 : 0),
        totalBuyIn: 0,
    }));
    return settle([...players, ...leavers(state.departed)], state.entities, state.carriedIn, { startedAt: state.startedAt, through: state.settleThrough });
};

// Mid-hand, pots already paid out this hand are taken back too. A tournament settles prizes less money paid, once over.
export const pokerSettlement = (state: Pick<PokerGameState, 'players' | 'departed' | 'entrants' | 'tournamentOver' | 'chopOrder' | 'startedAt' | 'settleThrough'>) => {
    const { startedAt, settleThrough: through } = state;
    if (state.entrants) {
        return state.tournamentOver
            ? settle(state.entrants.map(e => ({ name: e.name, phoneNumber: e.phone, stack: e.prize, totalBuyIn: e.paid })), [], false, { tournament: tournamentLine(state.entrants, state.chopOrder), startedAt, through })
            : settle([], [], false, { notice: IN_PROGRESS });
    }
    return settle([...state.players.map(p => ({ ...p, stack: p.stack + p.totalPotContribution - (p.roundWinnings ?? 0) })), ...leavers(state.departed)], [], false, { startedAt, through });
};

// The house is in the transactions and people, not in the player nets.
export const blackjackSettlement = (state: Pick<BlackjackGameState, 'players' | 'dealerNet' | 'departed' | 'startedAt' | 'settleThrough'>) => settle([
    ...state.players.map(p => ({ ...p, stack: chipsWithBets(p) })),
    ...leavers(state.departed),
    { key: HOUSE_KEY, name: 'Dealer (House)', stack: state.dealerNet, totalBuyIn: 0 },
], [], false, { startedAt: state.startedAt, through: state.settleThrough });
