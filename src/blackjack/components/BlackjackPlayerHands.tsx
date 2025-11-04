// src/blackjack/components/BlackjackPlayerHands.tsx
import React, { useState } from 'react';
import type { BlackjackPlayer, HandStatus } from '../types/blackjackGameTypes';
import { toTitleCase } from '../../utils/formatters';

interface BlackjackPlayerHandsProps {
    player: BlackjackPlayer;
    isCurrentPlayer: boolean;
    currentHandId: string | null;
    gameStage: 'betting' | 'player-turn' | 'dealer-turn' | 'round-over' | 'dealing';
    isBettingLocked: boolean; // ADDED
    onPlaceBet: (playerId: number, handIndex: number, amount: number) => void;
    onPlayerAction: (action: 'hit' | 'stand' | 'double' | 'surrender') => void;
    onSetHandStatus: (playerId: number, handId: string, status: HandStatus) => void;
    onUnlockBet: () => void; // RENAMED
}

const BlackjackPlayerHands: React.FC<BlackjackPlayerHandsProps> = ({ 
    player, isCurrentPlayer, currentHandId, gameStage, isBettingLocked,
    onPlaceBet, onPlayerAction, onSetHandStatus, onUnlockBet
}) => {
    // This local state is only for when betting is unlocked
    const [betAmounts, setBetAmounts] = useState<Record<number, string>>({});

    const handleBetChange = (handIndex: number, amount: string) => {
        setBetAmounts(prev => ({ ...prev, [handIndex]: amount }));
    };

    const handleBetSubmit = (handIndex: number) => {
        const amount = parseInt(betAmounts[handIndex] || '0');
        if (amount > 0) {
            onPlaceBet(player.id, handIndex, amount);
            handleBetChange(handIndex, ''); // Clear input
        }
    };

    const renderBettingControls = (hand: typeof player.hands[0], handIndex: number) => {
        // --- UPDATED LOGIC ---
        if (isBettingLocked) {
             return (
                <div className="hand-bet" style={{ fontSize: '1.1rem', color: 'var(--color-glow-cyan)'}}>
                    Bet: <strong>₹{hand.bet}</strong> (Locked)
                </div>
            );
        }
        
        // Betting is unlocked, show input
        return (
            <div className="inline-input-group">
                <input
                    type="number"
                    value={betAmounts[handIndex] || ''}
                    onChange={e => handleBetChange(handIndex, e.target.value)}
                    placeholder={`Bet (Min: ${player.lastBet})`}
                />
                <button className="btn-success" onClick={() => handleBetSubmit(handIndex)}>Place Bet</button>
            </div>
        );
        // --- END UPDATED LOGIC ---
    };

    const renderPlayerTurnControls = (handId: string) => {
        const isCurrentHand = isCurrentPlayer && currentHandId === handId;
        if (!isCurrentHand) return null;

        return (
            <div className="game-actions">
                <button className="btn-primary" onClick={() => onPlayerAction('hit')}>Hit</button>
                <button className="btn-secondary" onClick={() => onPlayerAction('stand')}>Stand</button>
                <button className="btn-success" onClick={() => onPlayerAction('double')}>Double</button>
                <button className="btn-error" onClick={() => onPlayerAction('surrender')}>Surrender</button>
            </div>
        );
    };

    const renderSettlementControls = (handId: string, status: HandStatus) => {
         if (status !== 'stand' && status !== 'playing') return null;
         
         return (
             <div className="game-actions">
                <button className="btn-success" onClick={() => onSetHandStatus(player.id, handId, 'win')}>Win</button>
                <button className="btn-error" onClick={() => onSetHandStatus(player.id, handId, 'lose')}>Lose</button>
                <button className="btn-secondary" onClick={() => onSetHandStatus(player.id, handId, 'push')}>Push</button>
                <button className="btn-danger" onClick={() => onSetHandStatus(player.id, handId, 'busted')}>Bust</button>
                <button className="btn-accent" onClick={() => onSetHandStatus(player.id, handId, 'blackjack')}>Blackjack</button>
             </div>
         );
    };

    return (
        <div className={`player-hands-container ${isCurrentPlayer ? 'current-player-hands' : ''}`}>
            <h4>{toTitleCase(player.name)}'s Hands</h4>
            {player.hands.length === 0 && gameStage === 'betting' && (
                 <p style={{textAlign: 'center', color: 'var(--color-text-muted)'}}>
                    {isBettingLocked ? `Click 'Change Bets' to place new wagers.` : `Player will play ${player.initialHandsCount} hand(s). Place bets below.`}
                 </p>
            )}
            {player.hands.map((hand, index) => (
                <div 
                    key={hand.id} 
                    className={`player-hand ${currentHandId === hand.id ? 'current-hand' : ''} status-${hand.status}`}
                >
                    <div className="hand-info">
                        <strong>Hand {index + 1}</strong>
                        <div style={{textAlign: 'right'}}>
                            <span className="hand-status">{toTitleCase(hand.status)}</span>
                            {hand.bet > 0 && 
                                <span style={{color: 'var(--color-text-muted)', display: 'block', fontSize: '0.9rem'}}>
                                    Bet: ₹{hand.bet}
                                </span>
                            }
                        </div>
                    </div>
                    
                    {gameStage === 'betting' && renderBettingControls(hand, index)}
                    {gameStage === 'player-turn' && renderPlayerTurnControls(hand.id)}
                    {gameStage === 'dealer-turn' && renderSettlementControls(hand.id, hand.status)}
                </div>
            ))}
        </div>
    );
};

export default BlackjackPlayerHands;