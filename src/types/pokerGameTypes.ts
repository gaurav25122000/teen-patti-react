// src/types/pokerGameTypes.ts
import type { Player } from './gameTypes';

export type Card = {
    suit: 'H' | 'D' | 'C' | 'S';
    rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
};

export type PokerPlayer = Player & {
    cards: Card[];
    currentBet: number;
    isAllIn: boolean;
    hasFolded: boolean;
};

export type BettingRound = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerGameState {
    players: PokerPlayer[];
    pot: number;
    communityCards: Card[];
    deck: Card[];
    dealerIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    currentPlayerIndex: number;
    currentBet: number;
    bettingRound: BettingRound;
    isRoundActive: boolean;
    messages: string[];
    smallBlindAmount: number;
    bigBlindAmount: number;
}
