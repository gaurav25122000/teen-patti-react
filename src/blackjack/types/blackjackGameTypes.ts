// teen-patti-react/src/blackjack/types/blackjackGameTypes.ts
// src/blackjack/types/blackjackGameTypes.ts
import type { NightStats } from '../../utils/nightStats';
import type { Departure } from '../../utils/departures';
import type { BlackjackSettings } from '../../utils/gameSettings';

export type Card = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type HandStatus = 'playing' | 'stand' | 'busted' | 'blackjack' | 'push' | 'win' | 'lose' | 'surrendered';

export interface PlayerHand {
    id: string; // Unique ID for the hand (e.g., `${playerId}-hand-${index}`)
    cards: Card[]; // Kept simple as per request, just for display/logic
    bet: number; // The original bet amount
    wager: number; // The amount at risk (e.g., 2x bet if doubled)
    status: HandStatus;
    hasHit: boolean; // To prevent doubling after hitting
    insurance?: number; // side bet, half the original bet
    insuranceResult?: 'won' | 'lost';
    pp?: number; // Perfect Pairs side bet
    ppResult?: SideResult;
    t3?: number; // 21+3 side bet
    t3Result?: SideResult;
}

export type SideResult = 'lose' | 'mixed' | 'coloured' | 'perfect' | 'flush' | 'straight' | 'trips' | 'straight-flush' | 'suited-trips';

export interface BlackjackPlayer {
    id: number;
    name: string;
    stack: number;
    totalBuyIn: number;
    phoneNumber: string;
    initialHandsCount: number; // How many hands this player plays each round
    hands: PlayerHand[];
    isTakingBreak: boolean;
    lastBets: number[]; // UPDATED from lastBet: number
}

export interface DealerHand {
    cards: (Card | '?')[]; // '?' = face-down placeholder
    status: 'playing' | 'busted' | 'stand';
    score: number;
}

export type GameStage = 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'round-over';

export interface BlackjackGameState extends BlackjackSettings {
    players: BlackjackPlayer[];
    dealerHand: DealerHand;
    gameStage: GameStage;
    messages: string[];
    currentPlayerId: number | null; // Player whose turn it is
    currentHandId: string | null; // Hand whose turn it is
    dealerNet: number;
    isBettingLocked: boolean; // ADDED
    stats?: NightStats; // absent in saves from before the night summary
    departed?: Departure[]; // removed players, still settled
    bankerId?: number; // a player banking instead of the house
    bankerRounds?: number; // rounds banked so far this turn
}