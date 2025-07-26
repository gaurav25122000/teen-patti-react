// src/poker/types/pokerGameTypes.ts

export interface PokerPlayer {
    hasActed: boolean;
    id: number;
    name: string;
    stack: number;
    totalBuyIn: number; // <-- ADDED THIS LINE
    inHand: boolean;
    isAllIn: boolean;
    roundBet: number; // Amount bet in the current betting round
    totalPotContribution: number; // Total amount contributed to the pot for the entire hand
}

export type GameStage = 'pre-deal' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Pot {
    amount: number;
    eligiblePlayers: Set<number>;
}

export interface PokerGameState {
    players: PokerPlayer[];
    gameStage: GameStage;
    pot: Pot[];
    currentBet: number;
    lastRaiserId: number | null;
    lastRaiseAmount: number | null;
    activePlayerIndex: number;
    dealerButtonIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    smallBlindAmount: number;
    bigBlindAmount: number;
    messages: string[];
}