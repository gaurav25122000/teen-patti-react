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
                <h2>Players</h2>
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
                    <>
                        <button onClick={() => handleAction('fold')}>Fold</button>
                        <button onClick={() => handleAction('check')}>Check</button>
                        <button onClick={() => handleAction('call')}>Call</button>
                        <div>
                            <input type="number" value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))} />
                            <button onClick={() => handleAction('bet')}>Bet</button>
                            <button onClick={() => handleAction('raise')}>Raise</button>
                        </div>
                    </>
                )}
                <button onClick={actions.startRound} disabled={gameState.isRoundActive}>
                    Start Round
                </button>
                <button onClick={actions.nextBettingRound} disabled={!gameState.isRoundActive}>
                    Next Betting Round
                </button>
                <button onClick={handleEndRound} disabled={!gameState.isRoundActive}>
                    End Round
                </button>
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
