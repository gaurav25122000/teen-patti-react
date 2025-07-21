// src/components/PlayerList.tsx

import React from 'react';
import type { Player, GameState } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';

interface PlayerListProps {
  players: Player[];
  gameState: GameState;
  currentPlayer: Player | null;
}

const PlayerList: React.FC<PlayerListProps> = ({ players, gameState, currentPlayer }) => {
  return (
    <div className="player-list">
      <h3>Players ({players.length})</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Balance</th>
            <th>Pot Contribution</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const isFolded = gameState.foldedPlayerIds.has(p.id);
            const isCurrent = gameState.roundActive && currentPlayer?.id === p.id;
            const contribution = gameState.roundContributions.get(p.id) || 0;
            let status = "Waiting";

            if (gameState.roundActive) {
              if (isFolded) {
                status = "Folded";
              } else {
                status = gameState.blindPlayerIds.has(p.id) ? "Blind" : "Seen (Chaal)";
                if (isCurrent) status += " (Current Turn)";
              }
            }
            
            const className = `${isFolded ? 'folded' : ''} ${isCurrent ? 'current-player' : ''}`;

            return (
             <tr key={p.id} className={className}>
                <td data-label="ID">{p.id}</td>
                <td data-label="Name">{toTitleCase(p.name)}</td>
                <td data-label="Balance">Rs. {p.balance}</td>
                <td data-label="Contribution">Rs. {contribution}</td>
                <td data-label="Status">{status}</td>
            </tr>

            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PlayerList;