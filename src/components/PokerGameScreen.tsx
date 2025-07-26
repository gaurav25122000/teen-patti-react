// src/components/PokerGameScreen.tsx
import React from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import './Poker.css';

interface PokerGameScreenProps {
    gameHook: ReturnType<typeof usePokerGame>;
}

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ gameHook }) => {
    const { gameState, actions } = gameHook;

    const handleAction = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: number) => {
        actions.handlePlayerAction(action, amount);
    };

    return (
        <div className="poker-game-screen">
            <div className="poker-table">
                <div className="community-cards">
                    {gameState.communityCards.map((card, index) => (
                        <div key={index} className="card">{`${card.rank}${card.suit}`}</div>
                    ))}
                </div>
                <div className="pot">
                    Pot: ${gameState.pot}
                </div>

                <div className="players">
                    {gameState.players.map((player, index) => (
                        <div key={player.id} className={`player-seat seat-${index}`}>
                            <div className="player-info">
                                <div>{player.name}</div>
                                <div>${player.balance}</div>
                                {player.cards.map((card, i) => (
                                    <div key={i} className="card small">{`${card.rank}${card.suit}`}</div>
                                ))}
                                <div>Bet: ${player.currentBet}</div>
                                {gameState.dealerIndex === index && <div className="dealer-button">D</div>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="controls">
                {gameState.isRoundActive && (
                    <>
                        <button onClick={() => handleAction('fold')}>Fold</button>
                        <button onClick={() => handleAction('check')}>Check</button>
                        <button onClick={() => handleAction('call')}>Call</button>
                        <button onClick={() => handleAction('bet', 20)}>Bet 20</button>
                        <button onClick={() => handleAction('raise', 40)}>Raise to 40</button>
                    </>
                )}
                <button onClick={actions.startRound} disabled={gameState.isRoundActive}>
                    Start Round
                </button>
                 <button onClick={actions.advanceBettingRound} disabled={!gameState.isRoundActive}>
                    Advance Round
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
