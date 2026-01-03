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
import InteractionModal from './InteractionModal';
import EntityManager from './EntityManager';
import { calculateOwings, type Transaction } from '../utils/owingsLogic';
import { toTitleCase } from '../utils/formatters';
import { useBroadcast } from '../hooks/useBroadcast';
import ActionToast from './ActionToast';

// --- SVG Icons ---
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
    isReadOnly?: boolean;
}

const GameScreen: React.FC<GameScreenProps> = ({ gameHook, onShowSetup, isReadOnly = false }) => {
    const { gameState, activePlayers, currentPlayer, precedingPlayer, addMessage, actions } = gameHook;

    const [interaction, setInteraction] = useState<InteractionType>('idle');
    const [showOwings, setShowOwings] = useState(false);
    const [showEntityManager, setShowEntityManager] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // Streaming Hook
    const { startStreaming, stopStreaming, broadcast, isStreaming, streamId, viewerCount } = useBroadcast(); // REMOVED ARG
    const [showStreamModal, setShowStreamModal] = useState(false);

    // Broadcast state changes
    useEffect(() => {
        if (isStreaming && !isReadOnly) {
            broadcast({ ...gameState, gameType: 'teen-patti' });
        }
    }, [gameState, isStreaming, broadcast, isReadOnly]);

    const handleStartStream = () => {
        startStreaming();
        setShowStreamModal(true);
    };

    const handleStopStream = () => {
        stopStreaming();
        setShowStreamModal(false);
    };

    const copyStreamLink = () => {
        const link = `${window.location.origin}/watch/${streamId}`;
        navigator.clipboard.writeText(link);
        alert('Stream link copied to clipboard!');
    };

    const [bootAmount, setBootAmount] = useState('10');
    const [startPlayerId, setStartPlayerId] = useState('');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerBalance, setAddPlayerBalance] = useState('0');
    const [addPlayerPhone, setAddPlayerPhone] = useState('');
    const [deductAmount, setDeductAmount] = useState(0);
    const [reorderablePlayers, setReorderablePlayers] = useState<Player[]>([]);
    const [showContext, setShowContext] = useState<{ requester?: Player, target?: Player }>({});

    useEffect(() => {
        if (interaction === 'idle') return;
        const activeGamePlayers = gameState.players.filter(p => !p.isTakingBreak);

        switch (interaction) {
            case 'gettingBoot':
                setBootAmount(String(gameState.roundInitialBootAmount || 10));
                break;
            case 'addingPlayer':
                setAddPlayerName('');
                setAddPlayerBalance('0');
                setAddPlayerPhone('');
                break;
            case 'removingPlayer':
            case 'deductAndDistribute':
            case 'toggleBreak': // ADDED
                if (gameState.players.length > 0) setSelectedPlayerId(String(gameState.players[0].id));
                break;
            case 'gettingStartPlayer':
                // MODIFIED: Default to first active player
                if (activeGamePlayers.length > 0) {
                    setStartPlayerId(String(activeGamePlayers[0].id));
                } else if (gameState.players.length > 0) {
                    setStartPlayerId(String(gameState.players[0].id))
                }
                break;
            case 'selectingWinner':
                if (activePlayers.length > 0) setSelectedPlayerId(String(activePlayers[0].id));
                break;
            case 'reorderingPlayers':
                setReorderablePlayers([...gameState.players]);
                break;
        }
    }, [interaction, gameState.players, gameState.roundInitialBootAmount, activePlayers]);


    const handleShowOwings = () => {
        const playersWithInitialBalance = gameState.players.map(p => ({ ...p, totalBuyIn: 0 }));
        setTransactions(calculateOwings(playersWithInitialBalance, gameState.entities));
        setShowOwings(true);
    };

    const handleStartRound = useCallback(() => {
        const { lastWinnerId, roundInitialBootAmount, players } = gameState;
        
        // Find active players
        const activeGamePlayers = players.filter(p => !p.isTakingBreak);
        if (activeGamePlayers.length < 2) {
          addMessage("Not enough active players to start a round.", true);
          return;
        }

        const winner = players.find(p => p.id === lastWinnerId);
        
        // Find the index of the winner in the *full* players array
        const winnerIndex = winner ? players.indexOf(winner) : -1;

        if (lastWinnerId !== null && roundInitialBootAmount && winnerIndex !== -1) {
            // Start with the player *after* the last winner
            let nextPlayerIndex = (winnerIndex + 1) % players.length;
            
            // Find the next *active* player to start
            while (players[nextPlayerIndex].isTakingBreak) {
                nextPlayerIndex = (nextPlayerIndex + 1) % players.length;
            }
            actions.startRound(nextPlayerIndex, roundInitialBootAmount);
        } else {
            setInteraction('gettingBoot');
        }
    }, [gameState, actions, addMessage]);

    const handleShowClick = () => {
        const requester = currentPlayer;
        const target = precedingPlayer;
        if (!requester || !target) {
            alert("Cannot Show: No valid opponent found.");
            return;
        }

        setShowContext({ requester: currentPlayer, target: precedingPlayer });
        setSelectedPlayerId(String(currentPlayer.id));
        setInteraction('showingCards');
    };

    const renderModal = () => {
        if (interaction === 'idle' && !showStreamModal) return null;
            
        if (showStreamModal && streamId) {
             return (
                 <InteractionModal 
                    isOpen={true} 
                    onClose={() => setShowStreamModal(false)}
                    title="Live Stream Started"
                    theme="success"
                    footerContent={<button className="btn-modal btn-modal-primary" onClick={() => setShowStreamModal(false)}>Close</button>}
                >
                    <div style={{ textAlign: 'center' }}>
                        <p>Share this link with friends to let them watch:</p>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <input 
                                type="text" 
                                readOnly 
                                value={`${window.location.origin}/watch/${streamId}`} 
                                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', color: '#fff' }}
                            />
                            <button className="btn-secondary" onClick={copyStreamLink}>Copy</button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '12px' }}>
                            Keep this tab open. Stream ends if you leave.
                        </p>
                    </div>
                </InteractionModal>
             );
        }

        if (showStreamModal && !streamId) {
             return (
                 <InteractionModal 
                    isOpen={true} 
                    onClose={() => setShowStreamModal(false)}
                    title="Starting Stream..."
                    theme="default"
                    footerContent={null}
                >
                    <div style={{ padding: '20px', textAlign: 'center' }}>Connecting to stream server...</div>
                </InteractionModal>
             );
        }

        if (interaction === 'idle') return null;
        
        // Spectre Mode Enforcement: Block all interaction modals
        if (isReadOnly) return null;

        let title = '';
        let theme: 'confirmation' | 'danger' | 'success' | 'default' = 'default';
        let icon: React.ReactNode = null;
        let body: React.ReactNode = null;
        let footer: React.ReactNode = null;
        let primaryAction = () => { };
        let confirmText = "Confirm";
        const closeModal = () => setInteraction('idle');

        switch (interaction) {
            case 'gettingBoot':
                title = 'Set Boot Amount'; theme = 'default'; icon = <IconCash />;
                body = <div className="form-group"><label htmlFor="boot-amount">Enter amount</label><input id="boot-amount" type="number" value={bootAmount} onChange={e => setBootAmount(e.target.value)} min="1" autoFocus /></div>;
                confirmText = "Set & Continue";
                primaryAction = () => {
                    if (parseInt(bootAmount, 10) > 0) {
                        setInteraction('gettingStartPlayer');
                    } else {
                        alert('Invalid boot amount.');
                    }
                };
                break;

            case 'gettingStartPlayer':
                { title = "Select Starting Player"; theme = 'confirmation'; icon = <IconPlay />;
                // MODIFIED: Filter out players on break
                const activeGamePlayers = gameState.players.filter(p => !p.isTakingBreak);
                body = <div className="form-group"><label htmlFor="start-player-select">Who starts?</label><select id="start-player-select" value={startPlayerId} onChange={e => setStartPlayerId(e.target.value)}>{
                  activeGamePlayers.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)
                }</select></div>;
                primaryAction = () => {
                    const playerIndex = gameState.players.findIndex(p => p.id === parseInt(startPlayerId, 10));
                    if (playerIndex > -1) {
                        actions.startRound(playerIndex, parseInt(bootAmount, 10));
                        closeModal();
                    }
                };
                break; }

            case 'selectingWinner':
                title = "Select Round Winner"; theme = 'success'; icon = <IconTrophy />;
                body = <div className="form-group"><label>Who won?</label><select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{activePlayers.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div>;
                confirmText = "Award Pot";
                primaryAction = () => {
                    const winner = activePlayers.find(p => p.id === parseInt(selectedPlayerId, 10));
                    if (winner) actions.endRound(winner);
                    closeModal();
                };
                break;

            case 'showingCards':
                {
                    const { requester, target } = showContext;
                    title = "Showdown!"; theme = 'confirmation'; icon = <IconUsers />;
                    body = requester && target ? (
                        <div className="form-group">
                            <p><strong>{toTitleCase(requester?.name || '')}</strong> vs <strong>{toTitleCase(target?.name || '')}</strong></p>
                            <label>Who folds?</label>
                            <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                                <option value={requester?.id}>{toTitleCase(requester?.name || '')}</option>
                                <option value={target?.id}>{toTitleCase(target?.name || '')}</option>
                            </select>
                        </div>
                    ) : <p>Error initializing showdown.</p>;
                    
                    primaryAction = () => {
                        const cost = gameState.blindPlayerIds.has(requester!.id) ? gameState.currentStake : gameState.currentStake * 2;
                        actions.requestShow(cost);
                        actions.resolveShow(parseInt(selectedPlayerId, 10));
                        addMessage(`${toTitleCase(requester!.name)} pays ₹ ${cost} for Show with ${toTitleCase(target!.name)}.`);
                        closeModal();
                    };
                    break;
                }

            case 'addingPlayer':
                title = "Add Player"; theme = 'success'; icon = <IconUserPlus />;
                body = (
                    <>
                        <div className="form-group"><label>Name</label><input type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div>
                        <div className="form-group"><label>Balance</label><input type="number" value={addPlayerBalance} onChange={e => setAddPlayerBalance(e.target.value)} /></div>
                        <div className="form-group"><label>Phone Number</label><input type="tel" value={addPlayerPhone} onChange={e => setAddPlayerPhone(e.target.value)} placeholder="10 digits" /></div>
                    </>
                );
                primaryAction = () => {
                    if (!addPlayerName.trim()) return alert('Player name cannot be empty.');
                    if (!/^\d{10}$/.test(addPlayerPhone)) {
                        return alert('Please enter a valid 10-digit phone number.');
                    }
                    actions.addPlayer(addPlayerName, parseInt(addPlayerBalance, 10) || 0, addPlayerPhone);
                    closeModal();
                };
                break;

            case 'removingPlayer':
                title = 'Remove Player'; theme = 'danger'; icon = <IconUserMinus />;
                body = <div className="form-group"><label>Select player</label><select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div>;
                confirmText = "Remove";
                primaryAction = () => {
                    actions.removePlayer(parseInt(selectedPlayerId, 10));
                    closeModal();
                };
                break;

            // ADDED CASE
            case 'toggleBreak':
                title = "Toggle Player Break"; 
                theme = 'default'; 
                icon = <IconUsers />; // Re-using icon
                body = <div className="form-group"><label>Select player to toggle break status</label><select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)} ({p.isTakingBreak ? "On Break" : "Active"})</option>)}</select></div>;
                confirmText = "Confirm";
                primaryAction = () => {
                    actions.togglePlayerBreak(parseInt(selectedPlayerId, 10));
                    closeModal();
                };
                break;

            case 'reorderingPlayers':
                {
                    const movePlayer = (index: number, direction: 'up' | 'down') => {
                        const newPlayers = [...reorderablePlayers];
                        const [playerToMove] = newPlayers.splice(index, 1);
                        newPlayers.splice(direction === 'up' ? index - 1 : index + 1, 0, playerToMove);
                        setReorderablePlayers(newPlayers);
                    };
                    title = "Reorder Players"; theme = 'default'; icon = <IconList />;
                    body = <ul className="reorder-list">{reorderablePlayers.map((p, i) => <li key={p.id}><span>{toTitleCase(p.name)}</span><div className="reorder-buttons"><button onClick={() => movePlayer(i, 'up')} disabled={i === 0}>▲</button><button onClick={() => movePlayer(i, 'down')} disabled={i === reorderablePlayers.length - 1}>▼</button></div></li>)}</ul>;
                    primaryAction = () => {
                        actions.reorderPlayers(reorderablePlayers);
                        closeModal();
                    };
                    break;
                }

            case 'deductAndDistribute':
                title = "Deduct & Distribute"; theme = 'danger'; icon = <IconCash />;
                body = <><div className="form-group"><label>Deduct from</label><select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div><div className="form-group"><label>Amount</label><input type="number" value={deductAmount} onChange={e => setDeductAmount(Number(e.target.value))} /></div></>;
                primaryAction = () => {
                    if (deductAmount > 0) actions.deductAndDistribute(parseInt(selectedPlayerId, 10), deductAmount);
                    closeModal();
                };
                break;
        }

        footer = <><button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button><button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={primaryAction}>{confirmText}</button></>;

        return <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} icon={icon} footerContent={footer}>{body}</InteractionModal>;
    }


    return (
        <>
            {isReadOnly && <ActionToast messages={gameState.messages} />}
            <div className="game-screen">
                <div className="player-list-container">
                    <PlayerList players={gameState.players} gameState={gameState} currentPlayer={currentPlayer} />
                </div>
                <div className="main-content-container">
                    <div className="game-controls-container">
                        {isReadOnly && <div className="badge badge-warning" style={{ alignSelf: 'center', marginBottom: '1rem' }}>SPECTATOR MODE</div>}
                        
                         {!isReadOnly && !isStreaming && (
                            <button 
                                className="btn-sm btn-outline-info" 
                                style={{ marginBottom: '1rem' }} 
                                onClick={handleStartStream}
                            >
                                Start Live Stream
                            </button>
                        )}
                        
                        {!isReadOnly && isStreaming && (
                            <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="badge badge-success">LIVE ({viewerCount})</span>
                                <button className="btn-sm btn-outline-secondary" onClick={() => setShowStreamModal(true)}>Link</button>
                                <button className="btn-sm btn-outline-danger" onClick={handleStopStream}>Stop</button>
                            </div>
                        )}

                    <div style={isReadOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
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
                            onManageEntities={() => setShowEntityManager(true)}
                            onTogglePlayerBreak={() => setInteraction('toggleBreak')}
                        />
                    </div>
                    {gameState.roundActive && currentPlayer && (
                        <div style={isReadOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
                            <RoundControls
                                gameState={gameState}
                                currentPlayer={currentPlayer}
                                precedingPlayer={precedingPlayer}
                                activePlayers={activePlayers}
                                actions={{ ...actions, onShowClick: handleShowClick, onEndBettingClick: () => setInteraction('selectingWinner') }}
                            />
                        </div>
                    )}
                    </div>
                    <div className="side-panel-container">
                        <Notes roundActive={gameState.roundActive} />
                        <ActionLog messages={gameState.messages} />
                    </div>
                </div>
            </div>

            {renderModal()}

            <OwingsModal
                isOpen={showOwings}
                onClose={() => setShowOwings(false)}
                transactions={transactions}
            />

            {showEntityManager && (
                <EntityManager
                    isOpen={showEntityManager}
                    onClose={() => setShowEntityManager(false)}
                    players={gameState.players}
                    entities={gameState.entities}
                    onUpdateEntities={actions.updateEntities}
                    onUpdatePlayers={actions.updatePlayers}
                />
            )}
        </>
    );
};

export default GameScreen;