// src/components/GameScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { InteractionType, Player } from '../types/gameTypes';
import { useTeenPattiGame } from '../hooks/useTeenPattiGame';
import PlayerList from './PlayerList';
import ActionLog from './ActionLog';
import Notes from './Notes';
import GameControls from './GameControls';
import RoundControls from './RoundControls';
import OwingsModal from './OwingsModal';
import GameModalManager from './GameModalManager';
import { calculateOwings, type Transaction } from '../utils/owingsLogic';

interface GameScreenProps {
    gameHook: ReturnType<typeof useTeenPattiGame>;
    onShowSetup: () => void;
    onInteractionChange: (isModalOpen: boolean) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ gameHook, onShowSetup, onInteractionChange }) => {
    const { gameState, activePlayers, currentPlayer, precedingPlayer, actions } = gameHook;

    const [interaction, setInteraction] = useState<InteractionType>('idle');
    const [interactionData, setInteractionData] = useState<any>(null);
    const [showOwings, setShowOwings] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    useEffect(() => {
        onInteractionChange(interaction !== 'idle' || showOwings);
    }, [interaction, showOwings, onInteractionChange]);

    const handleShowOwings = () => {
        const playersWithInitialBalance = gameState.players.map(p => ({ ...p, totalBuyIn: 0 }));
        setTransactions(calculateOwings(playersWithInitialBalance));
        setShowOwings(true);
    };

    const handleStartRound = useCallback(() => {
        const { lastWinnerId, roundInitialBootAmount, players } = gameState;
        const winnerIndex = players.findIndex(p => p.id === lastWinnerId);

        if (lastWinnerId !== null && roundInitialBootAmount && winnerIndex !== -1) {
            actions.startRound((winnerIndex + 1) % players.length, roundInitialBootAmount);
        } else {
            setInteraction('gettingBoot');
        }
    }, [gameState, actions]);

    const handleShowClick = () => {
        if (!currentPlayer || !precedingPlayer) {
            actions.addMessage("No one to request a show with.", true);
            return;
        }
        const isRequesterBlind = gameState.blindPlayerIds.has(currentPlayer.id);
        const cost = isRequesterBlind ? gameState.currentStake : 2 * gameState.currentStake;
        actions.requestShow(cost);

        setInteractionData({ requester: currentPlayer, target: precedingPlayer });
        setInteraction('showingCards');
    };


    return (
        <>
            <div className="game-screen">
                <div className="player-list-container">
                    <PlayerList players={gameState.players} gameState={gameState} currentPlayer={currentPlayer} />
                </div>
                <div className="main-content-container">
                    <div className="game-controls-container">
                        <GameControls
                            gameState={gameState}
                            onStartRound={handleStartRound}
                            onChangeBoot={() => setInteraction('gettingBoot')}
                            onAddPlayer={() => setInteraction('addingPlayer')}
                            onRemovePlayer={() => setInteraction('removingPlayer')}
                            onReorderPlayers={() => setInteraction('reorderingPlayers')}
                            onDeductAndDistribute={() => setInteraction('deductAndDistribute')}
                            onShowOwings={handleShowOwings}
                            onShowSetup={onShowSetup}
                        />
                        {gameState.roundActive && currentPlayer && (
                            <RoundControls
                                gameState={gameState}
                                currentPlayer={currentPlayer}
                                precedingPlayer={precedingPlayer}
                                activePlayers={activePlayers}
                                actions={{ ...actions, onShowClick: handleShowClick, onEndBettingClick: () => setInteraction('selectingWinner')}}
                            />
                        )}
                    </div>
                    <div className="side-panel-container">
                        <Notes roundActive={gameState.roundActive} />
                        <ActionLog messages={gameState.messages} />
                    </div>
                </div>
            </div>

            <GameModalManager
                interaction={interaction}
                setInteraction={setInteraction}
                gameHook={gameHook}
                interactionData={interactionData}
            />

            <OwingsModal
                isOpen={showOwings}
                onClose={() => setShowOwings(false)}
                transactions={transactions}
            />
        </>
    );
};

export default GameScreen;