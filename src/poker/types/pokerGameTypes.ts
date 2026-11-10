// src/poker/types/pokerGameTypes.ts
import type { NightStats } from '../../utils/nightStats';
import type { BlindClock } from '../utils/blindLevels';
import type { Departure } from '../../utils/departures';
import type { PokerSettings } from '../../utils/gameSettings';

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
    rebuys?: number; // rebuys taken (setup and joining don't count)
    tookAddOn?: boolean;
}

// A tournament entrant: money paid, chips issued, then their place and prize once known.
export interface Entrant {
    id: number;
    name: string;
    phone?: string;
    paid: number;
    chips: number;
    place?: number;
    prize?: number;
}

export type GameStage = 'pre-deal' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Pot {
    amount: number;
    eligiblePlayers: Set<number>;
}

export interface PokerGameState extends BlindClock, Omit<PokerSettings, 'smallBlindAmount' | 'bigBlindAmount'> {
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
    startedAt?: number; // epoch ms at setup; absent in older saves
    settleThrough?: string | null; // Final Owings "Through <party label>"; null or absent is fewest transfers
    departed?: Departure[]; // removed players, still settled
    handNumber?: number;
    bombNext?: boolean; // a one-off bomb pot on the next hand
    optionHolderId?: number; // who acts last preflop: the straddler, else the big blind
    entrants?: Entrant[]; // tournament only
    bust?: { ranked: number[]; awaiting: number[] }; // last hand's busted ids, best place first; awaiting REBUY or OUT
    tournamentOver?: boolean;
    chopOrder?: number[]; // ids as the chop log lists them
    messages: string[];
}