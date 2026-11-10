// teen-patti-react/src/blackjack/components/BlackjackPlayerHands.tsx
// src/blackjack/components/BlackjackPlayerHands.tsx
import React, { useState } from 'react';
import type { BlackjackPlayer, HandStatus, PlayerHand, SideResult } from '../types/blackjackGameTypes';
import { toTitleCase, formatAmount } from '../../utils/formatters';
import type { SideKind } from '../engine';

const CHIPS = [10, 50, 100, 500];
const PAIR_RESULTS: [SideResult, string][] = [['lose', 'Lose'], ['mixed', 'Mixed 6:1'], ['coloured', 'Coloured 12:1'], ['perfect', 'Perfect 25:1']];
const THREE_RESULTS: [SideResult, string][] = [['lose', 'Lose'], ['flush', 'Flush 5:1'], ['straight', 'Straight 10:1'], ['trips', 'Trips 30:1'], ['straight-flush', 'Str. flush 40:1'], ['suited-trips', 'Suited trips 100:1']];
const RESULT_THEMES = ['btn-error', 'btn-sky', 'btn-violet', 'btn-pink', 'btn-orange', 'btn-accent']; // by position: Lose, then each payout

interface BlackjackPlayerHandsProps {
    player: BlackjackPlayer;
    isCurrentPlayer: boolean;
    currentHandId: string | null;
    gameStage: 'betting' | 'player-turn' | 'dealer-turn' | 'round-over' | 'dealing';
    isBettingLocked: boolean; // ADDED
    onPlaceBet: (playerId: number, handIndex: number, amount: number) => void;
    onSetHandStatus: (playerId: number, handId: string, status: HandStatus) => void;
    onUnlockBet: () => void; // RENAMED
    isBanker: boolean;
    sideBets: boolean;
    onPlaceSideBet: (playerId: number, handIndex: number, kind: SideKind, amount: number) => void;
    onSettleSideBet: (playerId: number, handId: string, kind: SideKind, result: SideResult) => void;
}

const BlackjackPlayerHands: React.FC<BlackjackPlayerHandsProps> = ({ 
    player, isCurrentPlayer, currentHandId, gameStage, isBettingLocked,
    onPlaceBet, onSetHandStatus, isBanker, sideBets, onPlaceSideBet, onSettleSideBet
}) => {
    // This local state is only for when betting is unlocked
    const [betAmounts, setBetAmounts] = useState<Record<number, string>>({});
    const [sideAmounts, setSideAmounts] = useState<Record<string, string>>({});

    const handleBetChange = (handIndex: number, amount: string) => {
        setBetAmounts(prev => ({ ...prev, [handIndex]: amount }));
    };

    const handleBetSubmit = (handIndex: number) => {
        const amount = Number(betAmounts[handIndex] || '0');
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
                    {/* UPDATED to show wager */}
                    Bet: <strong>₹{formatAmount(hand.wager)}</strong> (Locked)
                </div>
            );
        }
        
        // --- FIX: Get the last bet for this specific hand ---
        const lastBetForThisHand = player.lastBets[handIndex] || player.lastBets[0] || 10; // Fallback

        // Betting is unlocked: chips add to the field, Place Bet submits it (placeBet checks the limits).
        const addChip = (chip: number) => handleBetChange(handIndex, String((Number(betAmounts[handIndex] || '0') || 0) + chip));
        return (
            <>
                <div className="inline-input-group">
                    <input
                        type="number" inputMode="decimal"
                        value={betAmounts[handIndex] || ''}
                        onChange={e => handleBetChange(handIndex, e.target.value)}
                        placeholder={`Bet (Last: ${lastBetForThisHand})`}
                    />
                    <button className="btn-success" onClick={() => handleBetSubmit(handIndex)}>Place Bet</button>
                </div>
                <div className="chip-row">
                    {CHIPS.map(chip => <button key={chip} className="btn btn-chip" onClick={() => addChip(chip)}>+₹{formatAmount(chip)}</button>)}
                    <button className="btn btn-error btn-compact" onClick={() => handleBetChange(handIndex, '')}>CLEAR</button>
                    <button className="btn btn-sky btn-compact" onClick={() => handleBetChange(handIndex, String(lastBetForThisHand))}>REPEAT LAST</button>
                </div>
                {sideBets && hand.bet > 0 && renderSideBetInputs(handIndex)}
            </>
        );
        // --- END UPDATED LOGIC ---
    };

    const renderSideBetInputs = (handIndex: number) => (
        <div className="game-actions">
            {(['pp', 't3'] as SideKind[]).map(kind => {
                const key = `${handIndex}-${kind}`;
                const placed = player.hands[handIndex]?.[kind];
                return (
                    <div key={kind} className="inline-input-group">
                        <input type="number" inputMode="decimal" min="0" value={sideAmounts[key] ?? ''} placeholder={`${kind === 'pp' ? 'Perfect Pairs' : '21+3'}${placed ? ` (₹${formatAmount(placed)})` : ''}`}
                            onChange={e => setSideAmounts(prev => ({ ...prev, [key]: e.target.value }))} />
                        <button className="btn-orange" onClick={() => {
                            onPlaceSideBet(player.id, handIndex, kind, Number(sideAmounts[key] || '0') || 0);
                            setSideAmounts(prev => ({ ...prev, [key]: '' }));
                        }}>Place</button>
                    </div>
                );
            })}
        </div>
    );

    // Open side bets get a button per result; the round ends once all are marked.
    const renderSideBetResults = (hand: PlayerHand) => (
        <>
            {([['pp', PAIR_RESULTS, 'Perfect Pairs'], ['t3', THREE_RESULTS, '21+3']] as [SideKind, [SideResult, string][], string][])
                .filter(([kind]) => hand[kind] && !hand[kind === 'pp' ? 'ppResult' : 't3Result'])
                .map(([kind, results, title]) => (
                    <div key={kind} className="game-actions">
                        <span>{title} ₹{formatAmount(hand[kind]!)}:</span>
                        {results.map(([result, label], i) => (
                            <button key={result} className={`btn ${RESULT_THEMES[i]} btn-compact`} onClick={() => onSettleSideBet(player.id, hand.id, kind, result)}>{label}</button>
                        ))}
                    </div>
                ))}
        </>
    );

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
            {isBanker && <p style={{ textAlign: 'center' }}>{player.name} is the banker this round.</p>}
            {!isBanker && player.hands.length === 0 && gameStage === 'betting' && (
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
                            {/* --- UPDATED LOGIC --- */}
                            {hand.wager > 0 && 
                                <span style={{color: 'var(--color-text-muted)', display: 'block', fontSize: '0.9rem'}}>
                                    Bet: ₹{formatAmount(hand.wager)} {hand.wager !== hand.bet && `(2x${hand.bet})`}
                                </span>
                            }
                            {(hand.pp || hand.t3) &&
                                <span style={{color: 'var(--color-text-muted)', display: 'block', fontSize: '0.9rem'}}>
                                    {hand.pp ? `PP ₹${formatAmount(hand.pp)}${hand.ppResult ? ` (${hand.ppResult})` : ''} ` : ''}{hand.t3 ? `21+3 ₹${formatAmount(hand.t3)}${hand.t3Result ? ` (${hand.t3Result})` : ''}` : ''}
                                </span>
                            }
                            {hand.insurance &&
                                <span style={{color: 'var(--color-text-muted)', display: 'block', fontSize: '0.9rem'}}>
                                    Insurance: ₹{formatAmount(hand.insurance)}{hand.insuranceResult && ` (${hand.insuranceResult})`}
                                </span>
                            }
                        </div>
                    </div>
                    
                    {gameStage === 'betting' && renderBettingControls(hand, index)}
                    {gameStage === 'dealer-turn' && renderSettlementControls(hand.id, hand.status)}
                    {(gameStage === 'player-turn' || gameStage === 'dealer-turn') && renderSideBetResults(hand)}
                </div>
            ))}
        </div>
    );
};

export default BlackjackPlayerHands;