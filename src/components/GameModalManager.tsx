// src/components/GameModalManager.tsx
import React, { useState, useEffect } from 'react';
import type { InteractionType, Player, GameState } from '../types/gameTypes';
import { useTeenPattiGame } from '../hooks/useTeenPattiGame';
import InteractionModal from './InteractionModal';
import { toTitleCase } from '../utils/formatters';

// --- SVG Icons for Modals (copied here for self-containment) ---
const IconTrophy = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9 9 0 119 0zM16.5 18.75a9 9 0 00-9 0m9 0a9 9 0 01-9 0m9 0v-4.5A3.375 3.375 0 0012 10.5h-1.5a3.375 3.375 0 00-3.375 3.375v4.5m5.906-9.043c.124.083.242.172.355.267.112.096.22.2.322.308.1.107.196.22.286.338a3.743 3.743 0 01.286.338c.107.112.208.228.308.347.1.118.19.242.27.375M8.094 9.457c.124-.083.242-.172.355-.267.112-.096.22-.2.322-.308.1-.107.196-.22.286-.338a3.743 3.743 0 00.286-.338c.107-.112.208-.228.308-.347.1-.118.19-.242.27-.375" /></svg>;
const IconUserPlus = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.375 12.375 0 0112 21.75c-2.672 0-5.192-.7-7.235-1.936z" /></svg>;
const IconUserMinus = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconCash = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.75A.75.75 0 013 4.5h.75m0 0h.75A.75.75 0 015.25 6v.75m0 0v.75A.75.75 0 014.5 8.25h-.75m0 0h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75h.75m-6-3.75h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-.75.75h-.75M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>;
const IconList = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>;
const IconUsers = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zM10.5 18.75a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.5-2.962a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" /></svg>;
const IconPlay = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>;

interface GameModalManagerProps {
    interaction: InteractionType;
    setInteraction: (interaction: InteractionType) => void;
    gameHook: ReturnType<typeof useTeenPattiGame>;
    interactionData?: any;
}

const GameModalManager: React.FC<GameModalManagerProps> = ({ interaction, setInteraction, gameHook, interactionData }) => {
    const { gameState, activePlayers, actions } = gameHook;

    const [tempData, setTempData] = useState<any>({});
    const [bootAmount, setBootAmount] = useState('10');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerBalance, setAddPlayerBalance] = useState('0');
    const [deductAmount, setDeductAmount] = useState<number>(0);
    const [reorderablePlayers, setReorderablePlayers] = useState<Player[]>([]);

    useEffect(() => {
        if (interaction === 'idle') return;

        switch (interaction) {
            case 'gettingBoot':
                setBootAmount(String(gameState.roundInitialBootAmount || 10));
                break;
            case 'addingPlayer':
                setAddPlayerName('');
                setAddPlayerBalance('0');
                break;
            case 'removingPlayer':
            case 'deductAndDistribute':
                if (gameState.players.length > 0) setSelectedPlayerId(String(gameState.players[0].id));
                break;
            case 'gettingStartPlayer':
                if (gameState.players.length > 0) setSelectedPlayerId(String(gameState.players[0].id));
                break;
            case 'selectingWinner':
                if (activePlayers.length > 0) setSelectedPlayerId(String(activePlayers[0].id));
                break;
            case 'reorderingPlayers':
                setReorderablePlayers([...gameState.players]);
                break;
            case 'showingCards':
                if (interactionData?.requester) {
                    setSelectedPlayerId(String(interactionData.requester.id));
                }
                break;
        }
    }, [interaction, gameState.players, gameState.roundInitialBootAmount, activePlayers, interactionData]);

    const closeModal = () => setInteraction('idle');

    const movePlayer = (index: number, direction: 'up' | 'down') => {
        const newPlayers = [...reorderablePlayers];
        const [playerToMove] = newPlayers.splice(index, 1);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        newPlayers.splice(newIndex, 0, playerToMove);
        setReorderablePlayers(newPlayers);
    };

    if (interaction === 'idle') {
        return null;
    }

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
                setTempData({ bootAmount: boot });
                setInteraction('gettingStartPlayer');
            };
            break;

        case 'gettingStartPlayer':
            title = "Select Starting Player"; theme = 'confirmation'; icon = <IconPlay />;
            body = <div className="form-group"><label htmlFor="start-player-select">Who is starting the round?</label><select id="start-player-select" value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>{gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}</select></div>;
            primaryAction = () => {
                const playerId = parseInt(selectedPlayerId, 10);
                if (isNaN(playerId)) return;
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
                const { requester, target } = interactionData || {};
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
                                    <button onClick={() => movePlayer(index, 'up')} disabled={index === 0} aria-label="Move Up"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="reorder-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg></button>
                                    <button onClick={() => movePlayer(index, 'down')} disabled={index === reorderablePlayers.length - 1} aria-label="Move Down"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="reorder-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg></button>
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
                        <input id="deduct-amount" type="number" value={deductAmount} onChange={e => setDeductAmount(Number(e.target.value))} min="1" placeholder="Enter amount" />
                    </div>
                </>
            );
            confirmText = "Confirm & Distribute";
            primaryAction = () => {
                const playerId = parseInt(selectedPlayerId, 10);
                const amount = Number(deductAmount);
                if (isNaN(playerId) || isNaN(amount) || amount <= 0) return alert('Invalid player or amount.');
                actions.deductAndDistribute(playerId, amount);
                closeModal();
            };
            break;
    }

    footer = (
        <>
            <button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button>
            <button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={primaryAction}>
                {confirmText}
            </button>
        </>
    );

    return (
        <InteractionModal
            isOpen={true}
            onClose={closeModal}
            title={title}
            theme={theme}
            icon={icon}
            footerContent={footer}
        >
            {body}
        </InteractionModal>
    );
};

export default GameModalManager;