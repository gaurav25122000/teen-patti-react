// src/components/GameScreen.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTeenPattiGame } from '../hooks/useTeenPattiGame';
import PlayerList from './PlayerList';
import ActionLog from './ActionLog';
import Notes from './Notes';
import GameControls from './GameControls';
import RoundControls from './RoundControls';
import InteractionModal from './InteractionModal';
import MusicPlayer from './MusicPlayer';
import type { InteractionType, Player } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';

// --- SVG Icons for Modals ---
const IconTrophy = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9 9 0 119 0zM16.5 18.75a9 9 0 00-9 0m9 0a9 9 0 01-9 0m9 0v-4.5A3.375 3.375 0 0012 10.5h-1.5a3.375 3.375 0 00-3.375 3.375v4.5m5.906-9.043c.124.083.242.172.355.267.112.096.22.2.322.308.1.107.196.22.286.338a3.743 3.743 0 01.286.338c.107.112.208.228.308.347.1.118.19.242.27.375M8.094 9.457c.124-.083.242-.172.355-.267.112-.096.22-.2.322-.308.1-.107.196-.22.286-.338a3.743 3.743 0 00.286-.338c.107-.112.208-.228.308-.347.1-.118.19-.242.27-.375" /></svg>;
const IconUserPlus = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.375 12.375 0 0112 21.75c-2.672 0-5.192-.7-7.235-1.936z" /></svg>;
const IconUserMinus = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconCash = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.75A.75.75 0 013 4.5h.75m0 0h.75A.75.75 0 015.25 6v.75m0 0v.75A.75.75 0 014.5 8.25h-.75m0 0h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75h.75m-6-3.75h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-.75.75h-.75M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>;
const IconList = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>;
const IconUsers = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zM10.5 18.75a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" /></svg>;
const IconPlay = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>;

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

    // --- Local State for Modal Inputs ---
    const [bootAmount, setBootAmount] = useState('10');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerBalance, setAddPlayerBalance] = useState('0');
    const [deductAmount, setDeductAmount] = useState('0');
    const [reorderablePlayers, setReorderablePlayers] = useState<Player[]>([]);

    useEffect(() => {
        onInteractionChange(interaction !== 'idle');
        // Pre-select the first player in lists when a relevant modal opens
        if ((interaction === 'removingPlayer' || interaction === 'deductAndDistribute') && gameState.players.length > 0) {
            setSelectedPlayerId(String(gameState.players[0].id));
        }
        if (interaction === 'gettingStartPlayer' && gameState.players.length > 0) setSelectedPlayerId(String(gameState.players[0].id));
        if (interaction === 'selectingWinner' && activePlayers.length > 0) setSelectedPlayerId(String(activePlayers[0].id));
    }, [interaction, onInteractionChange, gameState.players, activePlayers]);

    const openModal = (type: InteractionType) => {
        if (type === 'gettingBoot') setBootAmount(String(gameState.roundInitialBootAmount || 10));
        if (type === 'addingPlayer') { setAddPlayerName(''); setAddPlayerBalance('0'); }
        if (type === 'deductAndDistribute') { setDeductAmount('0'); }
        if (type === 'reorderingPlayers') setReorderablePlayers([...gameState.players]);
        setInteraction(type);
    };
    const closeModal = () => {
        setInteraction('idle');
        setTempData({}); // Clear temporary data on any close
    };

    const movePlayer = (index: number, direction: 'up' | 'down') => {
        const newPlayers = [...reorderablePlayers];
        const [playerToMove] = newPlayers.splice(index, 1);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        newPlayers.splice(newIndex, 0, playerToMove);
        setReorderablePlayers(newPlayers);
    };

    const findPrecedingActivePlayer = useCallback((): Player | null => {
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

    const modalContent = useMemo(() => {
        if (interaction === 'idle') return null;

        let title = '';
        let theme: 'confirmation' | 'danger' | 'success' | 'default' = 'default';
        let icon: React.ReactNode = null;
        let body: React.ReactNode = null;
        let footer: React.ReactNode = null;
        let primaryAction = () => { };
        let confirmText = "Confirm";

        switch (interaction) {
            case 'gettingBoot':
                title = 'Set Boot Amount'; theme = 'default'; icon = <IconCash />;
                body = <div className="form-group"><label htmlFor="boot-amount">Enter amount for all players</label><input id="boot-amount" type="number" value={bootAmount} onChange={e => setBootAmount(e.target.value)} min="1" autoFocus /></div>;
                confirmText = "Set & Continue";
                primaryAction = () => {
                    const boot = parseInt(bootAmount, 10);
                    if (isNaN(boot) || boot <= 0) return alert('Invalid boot amount.');
                    const winnerIndex = gameState.players.findIndex(p => p.id === gameState.lastWinnerId);
                    if (winnerIndex !== -1) {
                        actions.startRound((winnerIndex + 1) % gameState.players.length, boot);
                        closeModal();
                    } else {
                        setTempData({ bootAmount: boot });
                        openModal('gettingStartPlayer');
                    }
                };
                break;

            case 'gettingStartPlayer':
                title = "Select Starting Player"; theme = 'confirmation'; icon = <IconPlay />;
                body = <div className="form-group"><label htmlFor="start-player-select">Who is starting the round?</label><select id="start-player-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div>;
                primaryAction = () => {
                    const playerId = parseInt(selectedPlayerId, 10);
                    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
                    if (playerIndex === -1) return alert("Invalid player selected.");
                    actions.startRound(playerIndex, tempData.bootAmount);
                    closeModal();
                };
                break;

            case 'selectingWinner':
                title = "Select Round Winner"; theme = 'success'; icon = <IconTrophy />;
                body = <div className="form-group"><label htmlFor="winner-select">Who won the hand? The pot will be awarded to them.</label><select id="winner-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{activePlayers.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div>;
                confirmText = "Award Pot";
                primaryAction = () => {
                    const winnerId = parseInt(selectedPlayerId, 10);
                    const winner = activePlayers.find(p => p.id === winnerId);
                    if (winner) actions.endRound(winner);
                    closeModal();
                };
                break;

            case 'showingCards':
                {
                    title = "Showdown!"; theme = 'confirmation'; icon = <IconUsers />;
                    const { requester, target } = tempData.showContext || {};
                    body = requester && target ? <div className="form-group"><p>Between <strong>{toTitleCase(requester.name)}</strong> and <strong>{toTitleCase(target.name)}</strong>.</p><label htmlFor="loser-select">Select which player folds (loses the show):</label><select id="loser-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}><option value={requester.id}>{toTitleCase(requester.name)}</option><option value={target.id}>{toTitleCase(target.name)}</option></select></div> : <p>Error: Players not found for show.</p>;
                    primaryAction = () => {
                        const loserId = parseInt(selectedPlayerId, 10);
                        if (isNaN(loserId)) return;
                        actions.resolveShow(loserId);
                        closeModal();
                    };
                    break;
                }

            case 'addingPlayer':
                title = "Add New Player"; theme = 'success'; icon = <IconUserPlus />;
                body = <><div className="form-group"><label htmlFor="add-player-name">Player Name</label><input id="add-player-name" type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div><div className="form-group"><label htmlFor="add-player-balance">Starting Balance</label><input id="add-player-balance" type="number" value={addPlayerBalance} onChange={e => setAddPlayerBalance(e.target.value)} /></div></>;
                primaryAction = () => {
                    const balance = parseInt(addPlayerBalance, 10);
                    if (!addPlayerName || isNaN(balance)) return alert('Invalid name or balance.');
                    actions.addPlayer(addPlayerName, balance);
                    closeModal();
                };
                break;

            case 'removingPlayer':
                title = 'Remove Player'; theme = 'danger'; icon = <IconUserMinus />;
                body = <><p>Are you sure to remove this player? This action cannot be undone.</p><div className="form-group"><label htmlFor="remove-player-select">Select player to remove</label><select id="remove-player-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div></>;
                confirmText = "Yes, Remove";
                primaryAction = () => {
                    const playerId = parseInt(selectedPlayerId, 10);
                    if (isNaN(playerId)) return;
                    actions.removePlayer(playerId);
                    closeModal();
                };
                break;

            case 'reorderingPlayers':
                title = "Reorder Players"; theme = 'default'; icon = <IconList />;
                body = (
                    <>
                        <p>Change the seating order. The first player deals next.</p>
                        <ul className="reorder-list">
                            {reorderablePlayers.map((player, index) => (
                                <li key={player.id}>
                                    <span>{toTitleCase(player.name)}</span>
                                    <div className="reorder-buttons">
                                        <button onClick={() => movePlayer(index, 'up')} disabled={index === 0} aria-label="Move Up">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="reorder-icon">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                            </svg>
                                        </button>
                                        <button onClick={() => movePlayer(index, 'down')} disabled={index === reorderablePlayers.length - 1} aria-label="Move Down">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="reorder-icon">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                );
                primaryAction = () => {
                    actions.reorderPlayers(reorderablePlayers);
                    closeModal();
                };
                break;

            case 'deductAndDistribute':
                title = "Deduct & Distribute"; theme = 'danger'; icon = <IconCash />;
                body = (
                    <>
                        <div className="form-group">
                            <label htmlFor="deduct-player-select">Select player to deduct from</label>
                            <select id="deduct-player-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                                {gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="deduct-amount">Amount to deduct & distribute</label>
                            <input id="deduct-amount" type="number" value={deductAmount} onChange={e => setDeductAmount(e.target.value)} min="1" placeholder="Enter amount" />
                        </div>
                    </>
                );
                confirmText = "Confirm & Distribute";
                primaryAction = () => {
                    const playerId = parseInt(selectedPlayerId, 10);
                    const amount = parseInt(deductAmount, 10);
                    if (isNaN(playerId) || isNaN(amount) || amount <= 0) return alert('Invalid player or amount.');
                    actions.deductAndDistribute(playerId, amount);
                    closeModal();
                };
                break;
        }

        footer = (
            <>
                <button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button>
                <button className={`btn-modal btn-modal-primary theme-${theme} rainbow-outline`} onClick={primaryAction}>
                    {confirmText}
                </button>
            </>
        );
        return { title, theme, icon, body, footer };
    }, [interaction, gameState.players, gameState.lastWinnerId, gameState.roundInitialBootAmount, bootAmount, selectedPlayerId, addPlayerName, addPlayerBalance, reorderablePlayers, activePlayers, tempData, actions]);

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

        // Pre-select the requester as the default loser
        setSelectedPlayerId(String(requester.id));
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
                        <Notes />
                        <ActionLog messages={gameState.messages} />
                        {/* <MusicPlayer /> */}
                    </div>
                </div>
            </div>

            <InteractionModal
                isOpen={interaction !== 'idle'}
                onClose={closeModal}
                title={modalContent?.title || ''}
                theme={modalContent?.theme}
                icon={modalContent?.icon}
                footerContent={modalContent?.footer}
            >
                {modalContent?.body}
            </InteractionModal>

        </>
    );
};

export default GameScreen;