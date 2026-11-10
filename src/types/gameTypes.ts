// src/types/gameTypes.ts
import type { NightStats } from '../utils/nightStats';
import type { TeenPattiSettings } from '../utils/gameSettings';
import type { Departure } from '../utils/departures';

export interface Player {
  id: number;
  name: string;
  balance: number;
  entityId?: number;
  phoneNumber?: string; 
  isTakingBreak: boolean; // ADDED
}

export interface Entity {
    id: number;
    name:string;
}

export interface GameState extends TeenPattiSettings {
  players: Player[];
  entities: Entity[];
  lastWinnerId: number | null;
  roundActive: boolean;
  currentPlayerIndex: number;
  currentStake: number;
  potAmount: number;
  foldedPlayerIds: Set<number>;
  blindPlayerIds: Set<number>;
  lastActorWasBlind: boolean;
  roundInitialBootAmount: number | null;
  roundContributions: Map<number, number>;
  blindTurns?: Record<number, number>; // blind bets per player this round
  stats?: NightStats; // absent in saves from before the night summary
  startedAt?: number; // epoch ms at setup; absent in older saves
  carriedIn?: boolean; // a player started or joined with a non-zero balance; absent in older saves (unknown)
  departed?: Departure[]; // removed players, still settled
  dealerId?: number; // set when a round starts: the player before the starter
  roundsStarted?: number; // since setup, for the boot rise
  messages: string[];
}

export type InteractionType =
  | 'idle'
  | 'gettingBoot'
  | 'gettingStartPlayer'
  | 'addingPlayer'
  | 'removingPlayer'
  | 'selectingWinner'
  | 'showingCards'
  | 'reorderingPlayers'
  | 'deductAndDistribute'
  | 'toggleBreak' // ADDED
  | 'settings';