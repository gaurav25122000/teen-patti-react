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
    const { currentBet, lastRaiseAmount, bigBlindAmount } = gameState;
    const canCheck = currentPlayer.roundBet >= currentBet;
    const callAmount = Math.min(currentBet - currentPlayer.roundBet, currentPlayer.stack);
    const isFacingAllInCall = !canCheck && callAmount === currentPlayer.stack;

    // This is the core fix for the min-raise logic
    const minRaiseIncrement = lastRaiseAmount || bigBlindAmount;
    const minRaiseTotal = currentBet + minRaiseIncrement;

    // Check if player is allowed to raise
    const canRaise = !currentPlayer.canOnlyCall && currentPlayer.stack > callAmount && !isFacingAllInCall;

    useEffect(() => {
        // Set the default raise amount in the input box to the minimum legal raise
        setRaiseAmount(String(minRaiseTotal));
    }, [minRaiseTotal]);

    const handleRaise = () => {
        const amount = parseInt(raiseAmount);
        if (isNaN(amount) || amount < minRaiseTotal) {
            alert(`Raise must be at least to ${minRaiseTotal}.`);
            return;
        }
        if (amount - currentPlayer.roundBet > currentPlayer.stack) {
            // This case should be handled as an all-in, but for simplicity we'll alert.
            // A more advanced implementation would convert this to an all-in action.
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
                <div className='turn-info' style={{ fontSize: 20 }}>
                    <div>Current Bet</div> ₹ {currentBet}
                </div>
                <div className='current-stake' style={{ fontSize: 20 }}><div>Your Bet</div> ₹ {currentPlayer.roundBet}</div>
                <div className='pot-info'>
                    <div>Total Pot</div> ₹ {gameState.players.reduce((sum, p) => sum + p.totalPotContribution, 0)}
                </div>
            </div>
            <div className="game-actions">
                <button className="btn-error btn-action-lg" onClick={() => actions.handlePlayerAction('fold')}>Fold</button>
                
                {isFacingAllInCall ? (
                    <button className="btn-primary btn-action-lg" onClick={() => actions.handlePlayerAction('call')}>
                        All-in (Call ₹ {callAmount})
                    </button>
                ) : canCheck ? (
                    <button className="btn-secondary btn-action-lg" onClick={() => actions.handlePlayerAction('check')}>Check</button>
                ) : (
                    <button className="btn-primary btn-action-lg" onClick={() => actions.handlePlayerAction('call')}>
                        Call (₹ {callAmount})
                    </button>
                )}
                
                {canRaise && (
                    <div className="inline-input-group">
                        <input
                            type="number"
                            step={minRaiseIncrement}
                            value={raiseAmount}
                            onChange={(e) => setRaiseAmount(e.target.value)}
                            min={minRaiseTotal}
                            placeholder={`Min ${minRaiseTotal}`}
                        />
                        {currentBet > 0 ?
                            <button className="btn-success btn-action-lg" onClick={handleRaise}>Raise To</button> :
                            <button className="btn-success btn-action-lg" onClick={handleBet}>Bet</button>
                        }
                    </div>
                )}
                
                {!isFacingAllInCall && (
                    <button className="btn-accent rainbow-outline btn-action-lg" onClick={() => actions.handlePlayerAction('all-in')}>
                        All-In (₹ {currentPlayer.stack})
                    </button>
                )}
            </div>
        </div>
    );
};

export default PokerRoundControls;