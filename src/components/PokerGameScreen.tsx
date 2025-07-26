// src/components/PokerGameScreen.tsx
import React, { useState } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import './Poker.css';

interface PokerGameScreenProps {
    gameHook: ReturnType<typeof usePokerGame>;
}

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ gameHook }) => {
    const { gameState, actions } = gameHook;
    const [betAmount, setBetAmount] = useState(gameState.bigBlindAmount);

    const handleAction = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise') => {
        actions.handlePlayerAction(action, betAmount);
    };

    const handleEndRound = () => {
        const winnerId = prompt("Enter the ID of the winner:");
        if (winnerId) {
            const winner = gameState.players.find(p => p.id === parseInt(winnerId));
            if (winner) {
                actions.endRound(winner);
            } else {
                alert("Invalid winner ID.");
            }
        }
    };

    return (
        <div className="poker-game-screen">
            <div className="player-list">
                <h3>Players</h3>
                {gameState.players.map((player, index) => (
                    <div key={player.id} className={`player-item ${gameState.currentPlayerIndex === index ? 'active' : ''}`}>
                        <span>{player.name}</span>
                        <span>${player.balance}</span>
                        <span>Bet: ${player.currentBet}</span>
                        {player.hasFolded && <span>(Folded)</span>}
                        {gameState.dealerIndex === index && <span className="dealer-chip">D</span>}
                    </div>
                ))}
            </div>
            <div className="game-info">
                <div className="pot">
                    Pot: ${gameState.pot}
                </div>
                <div className="current-bet">
                    Current Bet: ${gameState.currentBet}
                </div>
            </div>
            <div className="controls">
                {gameState.isRoundActive && (
                    <div className="round-controls">
                        <button className="btn btn-error" onClick={() => handleAction('fold')}>Fold</button>
                        <button className="btn btn-secondary" onClick={() => handleAction('check')}>Check</button>
                        <button className="btn btn-primary" onClick={() => handleAction('call')}>Call</button>
                        <div className="inline-input-group">
                            <input type="number" value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))} />
                            <button className="btn btn-success" onClick={() => handleAction('bet')}>Bet</button>
                            <button className="btn btn-accent" onClick={() => handleAction('raise')}>Raise</button>
                        </div>
                    </div>
                )}
                 <div className="game-actions">
                    <button className="btn btn-start" onClick={actions.startRound} disabled={gameState.isRoundActive}>
                        Start Round
                    </button>
                    <button className="btn btn-primary" onClick={actions.nextBettingRound} disabled={!gameState.isRoundActive}>
                        Next Betting Round
                    </button>
                    <button className="btn btn-success" onClick={handleEndRound} disabled={!gameState.isRoundActive}>
                        End Round
                    </button>
                </div>
            </div>
            <div className="action-log">
                {gameState.messages.map((msg, i) => (
                    <div key={i}>{msg}</div>
                ))}
            </div>
        </div>
    );
};

export default PokerGameScreen;
