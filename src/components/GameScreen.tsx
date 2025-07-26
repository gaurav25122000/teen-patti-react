// src/components/GameScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTeenPattiGame } from '../hooks/useTeenPattiGame';
import PlayerList from './PlayerList';
import ActionLog from './ActionLog';
import Notes from './Notes';
import GameControls from './GameControls';
import RoundControls from './RoundControls';
import InteractionModal from './InteractionModal';
import type { InteractionType } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';

interface GameScreenProps {
    gameHook: ReturnType<typeof useTeenPattiGame>;
    onShowSetup: () => void;
    onInteractionChange: (isModalOpen: boolean) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ gameHook, onShowSetup, onInteractionChange }) => {
    const { gameState, addMessage, activePlayers, currentPlayer, actions } = gameHook;

    // --- Modal State ---
    const [interaction, setInteraction] = useState<InteractionType>('idle');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tempData, setTempData] = useState<any>({});

    useEffect(() => {
        onInteractionChange(interaction !== 'idle');
    }, [interaction, onInteractionChange]);

    const openModal = (type: InteractionType) => {
        setInteraction(type);
    };
    const closeModal = () => {
        setInteraction('idle');
        setTempData({}); // Clear temporary data on any close
    };

    const findPrecedingActivePlayer = useCallback((): any | null => {
        if (!currentPlayer) return null;
        const numPlayers = gameState.players.length;
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

    const handleStartRound = () => {
        const winnerIndex = gameState.players.findIndex(p => p.id === gameState.lastWinnerId);
        if (gameState.lastWinnerId !== null && gameState.roundInitialBootAmount && winnerIndex !== -1) {
            actions.startRound((winnerIndex + 1) % gameState.players.length, gameState.roundInitialBootAmount);
        } else {
            openModal('gettingBoot');
        }
    };

    const handleShowClick = () => {
        const requester = currentPlayer;
        const target = findPrecedingActivePlayer();
        if (!requester || !target) {
            alert("Cannot Show: No valid opponent found.");
            return;
        }

        const cost = gameState.blindPlayerIds.has(requester.id) ? gameState.currentStake : gameState.currentStake * 2;
        actions.requestShow(cost);
        addMessage(`${toTitleCase(requester.name)} pays ₹ ${cost} for Show with ${toTitleCase(target.name)}.`);

        setTempData({ showContext: { requester, target } });
        openModal('showingCards');
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
                            onChangeBoot={() => openModal('gettingBoot')}
                            onAddPlayer={() => openModal('addingPlayer')}
                            onRemovePlayer={() => openModal('removingPlayer')}
                            onReorderPlayers={() => openModal('reorderingPlayers')}
                            onDeductAndDistribute={() => openModal('deductAndDistribute')}
                            onShowSetup={onShowSetup}
                        />
                        {gameState.roundActive && currentPlayer && (
                            <RoundControls
                                gameState={gameState}
                                currentPlayer={currentPlayer}
                                activePlayers={activePlayers}
                                actions={{
                                    playBlind: actions.playBlind,
                                    seeCards: actions.seeCards,
                                    betChaal: actions.betChaal,
                                    fold: actions.fold,
                                    onShowClick: handleShowClick,
                                    onEndBettingClick: () => openModal('selectingWinner')
                                }}
                            />
                        )}
                    </div>
                    <div className="side-panel-container">
                        <Notes roundActive={gameState.roundActive} />
                        <ActionLog messages={gameState.messages} />
                        {/* <MusicPlayer /> */}
                    </div>
                </div>
            </div>

            <InteractionModal
                gameHook={gameHook}
                interaction={interaction}
                tempData={tempData}
                onClose={closeModal}
                openModal={openModal}
            />
        </>
    );
};

export default GameScreen;