// src/poker/types/pokerGameTypes.ts
import type { NightStats } from '../../utils/nightStats';
import type { BlindClock } from '../utils/blindLevels';
import type { Departure } from '../../utils/departures';

export interface PokerPlayer {
    hasActed: boolean;
    id: number;
    name: string;
    stack: number;
    totalBuyIn: number;
    phoneNumber?: string; // ADDED
    inHand: boolean;
    isAllIn: boolean;
    roundBet: number;
    totalPotContribution: number;
    isTakingBreak: boolean; // ADDED
    canOnlyCall: boolean; // ADDED
    winningStreak: number; // ADDED
    roundWinnings: number; // ADDED for determining streak winner at end of hand
}

export type GameStage = 'pre-deal' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Pot {
    amount: number;
    eligiblePlayers: Set<number>;
}

export interface PokerGameState extends BlindClock {
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
    stats?: NightStats; // absent in saves from before the night summary
    departed?: Departure[]; // removed players, still settled
    messages: string[];
}