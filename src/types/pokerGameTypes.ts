// src/types/pokerGameTypes.ts
import type { Player } from './gameTypes';

export type PokerPlayer = Player & {
    currentBet: number;
    hasFolded: boolean;
};

export interface PokerGameState {
    players: PokerPlayer[];
    pot: number;
    dealerIndex: number;
    currentPlayerIndex: number;
    currentBet: number;
    isRoundActive: boolean;
    messages: string[];
    smallBlindAmount: number;
    bigBlindAmount: number;
}
