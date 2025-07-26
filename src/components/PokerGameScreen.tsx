// src/components/PokerGameScreen.tsx
import React, { useState, useMemo } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import PokerInteractionModal from './PokerInteractionModal';
import './Poker.css';

type PokerInteractionType = 'idle' | 'bet' | 'raise' | 'fold' | 'endRound';

interface PokerGameScreenProps {
    gameHook: ReturnType<typeof usePokerGame>;
}

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ gameHook }) => {
    const { gameState, actions } = gameHook;
    const [interaction, setInteraction] = useState<PokerInteractionType>('idle');
    const [betAmount, setBetAmount] = useState(gameState.bigBlindAmount);

    const openModal = (type: PokerInteractionType) => {
        setInteraction(type);
    };

    const closeModal = () => {
        setInteraction('idle');
    };

    const handleAction = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise') => {
        actions.handlePlayerAction(action, betAmount);
        closeModal();
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
        closeModal();
    };

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    const modalContent = useMemo(() => {
        if (interaction === 'idle') return null;

        let title = '';
        let body: React.ReactNode = null;
        let footer: React.ReactNode = null;

        switch (interaction) {
            case 'bet':
            case 'raise':
                title = `${interaction.charAt(0).toUpperCase() + interaction.slice(1)} Amount`;
                body = (
                    <div className="form-group">
                        <label htmlFor="bet-amount">Enter amount for {currentPlayer?.name}</label>
                        <input id="bet-amount" type="number" value={betAmount} onChange={e => setBetAmount(parseInt(e.target.value))} min="1" autoFocus />
                    </div>
                );
                footer = (
                    <>
                        <button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button>
                        <button className="btn-modal btn-modal-primary theme-success" onClick={() => handleAction(interaction)}>
                            {interaction}
                        </button>
                    </>
                );
                break;
            case 'fold':
                title = 'Confirm Fold';
                body = <p>Are you sure you want to fold, {currentPlayer?.name}?</p>;
                footer = (
                    <>
                        <button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button>
                        <button className="btn-modal btn-modal-primary theme-danger" onClick={() => handleAction('fold')}>
                            Fold
                        </button>
                    </>
                );
                break;
             case 'endRound':
                title = 'End Round';
                body = <p>Select the winner of the round.</p>;
                footer = (
                    <>
                        <button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button>
                        <button className="btn-modal btn-modal-primary theme-success" onClick={handleEndRound}>
                            Confirm Winner
                        </button>
                    </>
                );
                break;
        }

        return { title, body, footer };
    }, [interaction, betAmount, currentPlayer]);

    return (
        <>
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
                            <button className="btn btn-error" onClick={() => openModal('fold')}>Fold</button>
                            <button className="btn btn-secondary" onClick={() => handleAction('check')}>Check</button>
                            <button className="btn btn-primary" onClick={() => handleAction('call')}>Call</button>
                            <button className="btn btn-success" onClick={() => openModal('bet')}>Bet</button>
                            <button className="btn btn-accent" onClick={() => openModal('raise')}>Raise</button>
                        </div>
                    )}
                     <div className="game-actions">
                        <button className="btn btn-start" onClick={actions.startRound} disabled={gameState.isRoundActive}>
                            Start Round
                        </button>
                        <button className="btn btn-primary" onClick={actions.nextBettingRound} disabled={!gameState.isRoundActive}>
                            Next Betting Round
                        </button>
                        <button className="btn btn-success" onClick={() => openModal('endRound')} disabled={!gameState.isRoundActive}>
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
            <PokerInteractionModal
                isOpen={interaction !== 'idle'}
                onClose={closeModal}
                title={modalContent?.title || ''}
                footerContent={modalContent?.footer}
            >
                {modalContent?.body}
            </PokerInteractionModal>
        </>
    );
};

export default PokerGameScreen;
