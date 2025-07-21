import React, { useState, useEffect, useCallback } from 'react';
import type { GameState, Player } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';

interface RoundControlsProps {
    gameState: GameState;
    currentPlayer: Player;
    activePlayers: Player[];
    actions: {
        playBlind: (isRaise: boolean, amount: number) => void;
        seeCards: () => void;
        betChaal: (amount: number) => void;
        fold: () => void;
        onShowClick: () => void;
        onEndBettingClick: () => void;
    };
}

const RoundControls: React.FC<RoundControlsProps> = ({ gameState, currentPlayer, activePlayers, actions }) => {
    const [betAmountInput, setBetAmountInput] = useState("");
    const [blindRaiseAmountInput, setBlindRaiseAmountInput] = useState("");
    const { currentStake, blindPlayerIds, potAmount } = gameState;

    useEffect(() => {
        if (blindPlayerIds.has(currentPlayer.id)) {
            setBetAmountInput(String(currentStake));
            setBlindRaiseAmountInput(String(currentStake * 2));
        } else {
            const minChaalBet = 2 * currentStake;
            setBetAmountInput(String(minChaalBet));
            setBlindRaiseAmountInput("");
        }
    }, [currentPlayer, currentStake, blindPlayerIds]);

    const findPrecedingActivePlayer = useCallback((): Player | null => {
        const numPlayers = gameState.players.length;
        if (numPlayers < 2) return null;

        let currentIndex = gameState.currentPlayerIndex;
        let attempts = 0;
        do {
            currentIndex = (currentIndex - 1 + numPlayers) % numPlayers;
            const precedingPlayer = gameState.players[currentIndex];
            if (precedingPlayer.id !== currentPlayer.id && !gameState.foldedPlayerIds.has(precedingPlayer.id)) {
                return precedingPlayer;
            }
            attempts++;
        } while (attempts < numPlayers);
        return null;
    }, [gameState.players, gameState.currentPlayerIndex, gameState.foldedPlayerIds, currentPlayer]);

    const precedingPlayer = findPrecedingActivePlayer();

    const calculateShowCost = useCallback((): number => {
        if (!precedingPlayer) return 0;
        const isRequesterBlind = blindPlayerIds.has(currentPlayer.id);
        if (isRequesterBlind) {
            return currentStake;
        } else {
            return 2 * currentStake;
        }
    }, [currentPlayer, precedingPlayer, blindPlayerIds, currentStake]);

    const handleConfirmBlindRaise = () => {
        const raiseAmount = parseInt(blindRaiseAmountInput);
        if (isNaN(raiseAmount) || raiseAmount <= currentStake) {
            alert(`Blind raise must be greater than the current stake of ₹ ${currentStake}.`);
            return;
        }
        actions.playBlind(true, raiseAmount);
    };

    const handleBetChaal = () => {
        const betAmount = parseInt(betAmountInput);
        const minChaalBet = 2 * currentStake;
        if (isNaN(betAmount) || betAmount < minChaalBet) {
            alert(`Bet must be at least ₹ ${minChaalBet}.`);
            return;
        }
        actions.betChaal(betAmount);
    };

    const isShowDisabled = !precedingPlayer || activePlayers.length < 2 || (blindPlayerIds.has(precedingPlayer.id) && !blindPlayerIds.has(currentPlayer.id) && activePlayers.length !== 2);
    const showTitle = isShowDisabled ? "Cannot show (e.g., no preceding player, target is blind)." : "Show cards";

    return (
        <div className="round-controls">
            <div className="round-info">
                <div className='turn-info'>Turn: <strong>{toTitleCase(currentPlayer.name)}</strong></div>
                <div className='current-stake'>
                    Current Stake
                    <br />
                    ₹ {blindPlayerIds.has(currentPlayer.id) ? currentStake : currentStake * 2}
                </div>
                <div className="pot-info"><strong>Pot Amount </strong><br />
                    <strong>₹ {potAmount}</strong></div>
            </div>

            {blindPlayerIds.has(currentPlayer.id) ? (
                // --- Actions for BLIND players ---
                <>
                    <div className="inline-input-group">
                        <input
                            type="number"
                            value={blindRaiseAmountInput}
                            onChange={(e) => setBlindRaiseAmountInput(e.target.value)}
                            placeholder={`₹ ` + `${currentStake}`}
                            min={currentStake + 1}
                        />
                        <button onClick={handleConfirmBlindRaise} className="btn btn-success">Raise Blind</button>
                    </div>
                    <button onClick={() => actions.playBlind(false, currentStake)} className="btn btn-primary">
                        Play Blind (Cost: ₹ {currentStake})
                    </button>
                    <button onClick={actions.seeCards} className="btn btn-accent">
                        See Cards
                    </button>
                </>
            ) : (
                // --- Actions for SEEN players ---
                <div className="inline-input-group">
                    <input
                        type="number"
                        value={betAmountInput}
                        onChange={(e) => setBetAmountInput(e.target.value)}
                        min={2 * currentStake}
                    />
                    <button onClick={handleBetChaal} className="btn btn-success">Bet / Chaal</button>
                </div>
            )}

            {/* --- Common Actions for ALL players --- */}
            <button onClick={actions.fold} className="btn btn-error">Fold</button>
            <button onClick={actions.onShowClick} className="btn btn-accent" disabled={isShowDisabled} title={showTitle}>
                Show (Cost: ₹ {calculateShowCost()})
            </button>
            <button onClick={actions.onEndBettingClick} className="btn btn-secondary">End Betting</button>
        </div>
    );
};

export default RoundControls;