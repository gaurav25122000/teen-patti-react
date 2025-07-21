// src/types/gameTypes.ts

export interface Player {
  id: number;
  name: string;
  balance: number;
}

export interface GameState {
  players: Player[];
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
  | 'reorderingPlayers';