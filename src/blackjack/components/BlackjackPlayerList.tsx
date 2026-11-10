// teen-patti-react/src/blackjack/components/BlackjackPlayerList.tsx
// src/blackjack/components/BlackjackPlayerList.tsx
import React, { useState } from 'react';
import Avatar from '../../components/Avatar';
import { readSavedPlayers } from '../../utils/savedPlayers';
import type { BlackjackPlayer, BlackjackGameState } from '../types/blackjackGameTypes';
import { toTitleCase, formatAmount } from '../../utils/formatters';

interface BlackjackPlayerListProps {
    players: BlackjackPlayer[];
    gameState: BlackjackGameState;
}

const BlackjackPlayerList: React.FC<BlackjackPlayerListProps> = ({ players, gameState }) => {
    const [saved] = useState(() => readSavedPlayers());
    const { currentPlayerId, gameStage } = gameState;

    return (
        <div className="player-list">
            <h3>Players ({players.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Stack / Buy-In</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((p) => {
                        const isCurrent = p.id === currentPlayerId && gameStage === 'player-turn';
                        
                        let status = 'Waiting';
                        if (p.id === gameState.bankerId) {
                            status = 'Banker';
                        } else if (p.isTakingBreak) {
                            status = 'On Break';
                        } else if (gameStage === 'betting') {
                            status = `${p.initialHandsCount} HAND${p.initialHandsCount === 1 ? '' : 'S'}`;
                        } else if (gameStage === 'player-turn') {
                            status = p.hands.every(h => h.status !== 'playing') ? 'Done' : 'Playing';
                            if (isCurrent) status = 'Current Turn';
                        } else if (gameStage === 'dealer-turn') {
                            status = 'Waiting for Settle';
                        }
                        
                        // Each hand's wager, or between rounds what the player usually bets.
                        const bets = p.hands.some(h => h.wager > 0) ? p.hands.map(h => `₹${formatAmount(h.wager)}`).join(' | ')
                            : p.lastBets.length > 0 ? `Last ${p.lastBets.slice(0, p.initialHandsCount).map(b => `₹${formatAmount(b)}`).join(' | ')}` : '';

                        return (
                            <tr key={p.id} className={isCurrent ? 'current-player' : (p.isTakingBreak ? 'on-break' : '')} data-player-id={p.id}>
                                <td data-label="Name"><Avatar name={p.name} phone={p.phoneNumber} saved={saved} /> {toTitleCase(p.name)}</td>
                                <td data-label="Stack / Buy-In">₹ {formatAmount(p.stack)} / ₹ {formatAmount(p.totalBuyIn)}</td>
                                <td data-label="Status">
                                    {status}
                                    {bets && ` · ${bets}`}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default BlackjackPlayerList;