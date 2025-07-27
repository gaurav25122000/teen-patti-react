// src/types/gameTypes.ts

export interface Player {
  id: number;
  name: string;
  balance: number;
  phoneNumber: string;
  entityId?: number;
}

export interface Entity {
    id: number;
    name:string;
}

export interface GameState {
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
  | 'deductAndDistribute';