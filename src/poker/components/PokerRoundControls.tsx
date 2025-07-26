// src/poker/components/PokerRoundControls.tsx
import React, { useState, useEffect } from 'react';
import type { PokerGameState, PokerPlayer } from '../types/pokerGameTypes';

interface PokerRoundControlsProps {
    gameState: PokerGameState;
    currentPlayer: PokerPlayer;
    actions: {
        handlePlayerAction: (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in', amount?: number) => void;
    };
}

const PokerRoundControls: React.FC<PokerRoundControlsProps> = ({ gameState, currentPlayer, actions }) => {
    const [raiseAmount, setRaiseAmount] = useState('');
    const { currentBet, bigBlindAmount } = gameState;
    const canCheck = currentPlayer.roundBet >= currentBet;
    const callAmount = Math.min(currentBet - currentPlayer.roundBet, currentPlayer.stack);

    const minRaise = currentBet > 0 ? currentBet * 2 : bigBlindAmount;

    useEffect(() => {
        setRaiseAmount(String(minRaise));
    }, [minRaise]);

    const handleRaise = () => {
        const amount = parseInt(raiseAmount);
        if (isNaN(amount) || amount < minRaise) {
            alert(`Raise must be at least to ${minRaise}.`);
            return;
        }
        if (amount - currentPlayer.roundBet > currentPlayer.stack) {
            alert("You cannot raise more than your stack.");
            return;
        }
        actions.handlePlayerAction('raise', amount);
    };

    const handleBet = () => {
        const amount = parseInt(raiseAmount);
        if (isNaN(amount) || amount < bigBlindAmount) {
            alert(`Bet must be at least the big blind (${bigBlindAmount}).`);
            return;
        }
        actions.handlePlayerAction('bet', amount);
    };

    return (
        <div className="round-controls">
            <h4>Turn: <strong>{currentPlayer.name}</strong> (Stack: {currentPlayer.stack})</h4>
            <div className="round-info">
                <div>Current Bet: ₹ {currentBet}</div>
                <div>Your Bet: ₹ {currentPlayer.roundBet}</div>
            </div>
            <div className="game-actions">
                <button className="btn-error" onClick={() => actions.handlePlayerAction('fold')}>Fold</button>
                {canCheck ? (
                    <button className="btn-secondary" onClick={() => actions.handlePlayerAction('check')}>Check</button>
                ) : (
                    <button className="btn-primary" onClick={() => actions.handlePlayerAction('call')}>Call (₹ {callAmount})</button>
                )}
                <div className="inline-input-group">
                    <input
                        type="number"
                        step={bigBlindAmount}
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(e.target.value)}
                        min={minRaise}
                    />
                    {currentBet > 0 ?
                        <button className="btn-success" onClick={handleRaise}>Raise To</button> :
                        <button className="btn-success" onClick={handleBet}>Bet</button>
                    }
                </div>
                <button className="btn-accent rainbow-outline" onClick={() => actions.handlePlayerAction('all-in')}>All-In (₹ {currentPlayer.stack})</button>
            </div>
        </div>
    );
};

export default PokerRoundControls;