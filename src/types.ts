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
  foldedPlayerIds: Set<number>; // Store IDs of folded players
  messages: string[];
  // We derive current player ID from players[currentPlayerIndex]
  // We derive active players by filtering players based on foldedPlayerIds
}