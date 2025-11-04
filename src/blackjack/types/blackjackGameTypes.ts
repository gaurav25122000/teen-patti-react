// src/blackjack/types/blackjackGameTypes.ts

export type Card = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type HandStatus = 'playing' | 'stand' | 'busted' | 'blackjack' | 'push' | 'win' | 'lose' | 'surrendered';

export interface PlayerHand {
    id: string; // Unique ID for the hand (e.g., `${playerId}-hand-${index}`)
    cards: Card[]; // Kept simple as per request, just for display/logic
    bet: number;
    status: HandStatus;
    hasHit: boolean; // To prevent doubling after hitting
}

export interface BlackjackPlayer {
    id: number;
    name: string;
    stack: number;
    totalBuyIn: number;
    phoneNumber: string;
    initialHandsCount: number; // How many hands this player plays each round
    hands: PlayerHand[];
    isTakingBreak: boolean;
    lastBet: number; // ADDED
}

export interface DealerHand {
    cards: Card[];
    status: 'playing' | 'busted' | 'stand';
    score: number;
}

export type GameStage = 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'round-over';

export interface BlackjackGameState {
    players: BlackjackPlayer[];
    dealerHand: DealerHand;
    gameStage: GameStage;
    messages: string[];
    currentPlayerId: number | null; // Player whose turn it is
    currentHandId: string | null; // Hand whose turn it is
    minBet: number;
    maxBet: number;
    allowSurrender: boolean;
    blackjackPayout: '3to2' | '6to5';
    dealerNet: number;
    isBettingLocked: boolean; // ADDED
}