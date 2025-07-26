// src/poker/components/PokerGameScreen.tsx
import React, { useState, useEffect } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import PokerPlayerList from './PokerPlayerList';
import PokerRoundControls from './PokerRoundControls';
import ActionLog from '../../components/ActionLog';
import InteractionModal from '../../components/InteractionModal';
import { toTitleCase } from '../../utils/formatters';

interface PokerGameScreenProps {
    pokerHook: ReturnType<typeof usePokerGame>;
    onInteractionChange: (isOpen: boolean) => void;
}

type ModalMode = 'none' | 'addPlayer' | 'removePlayer' | 'addChips' | 'showdown';

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ pokerHook, onInteractionChange }) => {
    const { gameState, actions } = pokerHook;
    const { players, activePlayerIndex, messages, gameStage, pot } = gameState;

    const [modalMode, setModalMode] = useState<ModalMode>('none');

    const [selectedWinnerId, setSelectedWinnerId] = useState<number | null>(null);

    const [managePlayerId, setManagePlayerId] = useState<string>('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerStack, setAddPlayerStack] = useState('1000');
    const [addChipsAmount, setAddChipsAmount] = useState('1000');

    const currentPlayer = activePlayerIndex > -1 ? players[activePlayerIndex] : null;

    useEffect(() => {
        if (gameStage === 'showdown' && pot.length > 0) {
            setModalMode('showdown');
        }
    }, [gameStage, pot]);

    useEffect(() => {
        const isModalOpen = modalMode !== 'none';
        onInteractionChange(isModalOpen);

        if (modalMode === 'showdown' && pot[0]?.eligiblePlayers.size > 0) {
            setSelectedWinnerId(Array.from(pot[0].eligiblePlayers)[0]);
        }
        if ((modalMode === 'removePlayer' || modalMode === 'addChips') && players.length > 0 && !managePlayerId) {
            setManagePlayerId(String(players[0].id));
        } else if (modalMode === 'addPlayer') {
            setManagePlayerId('');
        }
    }, [modalMode, onInteractionChange, pot, players, managePlayerId]);

    const closeModal = () => {
        setModalMode('none');
        setAddPlayerName('');
        setAddPlayerStack('1000');
        setAddChipsAmount('1000');
    };

    const handleAwardPot = () => {
        if (selectedWinnerId !== null) {
            actions.awardPot(0, selectedWinnerId);
        }
        if (pot.length <= 1) {
            closeModal();
        }
    };

    const handleManagePlayers = () => {
        switch (modalMode) {
            case 'addPlayer':
                if (!addPlayerName || !addPlayerStack) return alert("Please enter name and stack.");
                actions.addPlayer(addPlayerName, parseInt(addPlayerStack, 10));
                break;
            case 'removePlayer':
                if (!managePlayerId) return alert("Please select a player to remove.");
                actions.removePlayer(parseInt(managePlayerId, 10));
                setManagePlayerId('');
                break;
            case 'addChips':
                if (!managePlayerId) return alert("Please select a player.");
                actions.addChipsToPlayer(parseInt(managePlayerId, 10), parseInt(addChipsAmount, 10));
                break;
        }
        closeModal();
    }

    const renderStageDisplay = () => (
        <div className="stage-display">
            <h2>{toTitleCase(gameStage)}</h2>
        </div>
    );

    const renderModal = () => {
        if (modalMode === 'none') return null;

        let title = '';
        let body: React.ReactNode = null;
        let footer: React.ReactNode = null;
        let theme: 'success' | 'default' | 'danger' = 'default';

        switch (modalMode) {
            case 'showdown':
                {
                    const currentPot = pot[0];
                    if (!currentPot) return null;
                    const eligiblePlayers = players.filter(p => currentPot.eligiblePlayers.has(p.id));
                    title = `Awarding Pot (${currentPot.amount})`;
                    theme = 'success';
                    body = <div className="form-group">
                        <label htmlFor="winner-select">Select Winner</label>
                        <select id="winner-select" onChange={e => setSelectedWinnerId(Number(e.target.value))} value={selectedWinnerId ?? ''}>
                            {eligiblePlayers.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}
                        </select>
                    </div>;
                    footer = <button className="btn-modal btn-modal-primary theme-success" onClick={handleAwardPot}>Award Pot to Winner</button>;
                    break;
                }
            case 'addPlayer':
                title = "Add New Player";
                body = <>
                    <div className="form-group"><label>Player Name</label><input type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div>
                    <div className="form-group"><label>Starting Stack</label><input type="number" value={addPlayerStack} onChange={e => setAddPlayerStack(e.target.value)} /></div>
                </>;
                break;
            case 'removePlayer':
                title = "Remove Player";
                theme = 'danger';
                body = <div className="form-group"><label>Select Player to Remove</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>;
                break;
            case 'addChips':
                title = "Add Chips (Rebuy/Add-on)";
                body = <>
                    <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                    <div className="form-group"><label>Amount to Add</label><input type="number" value={addChipsAmount} onChange={e => setAddChipsAmount(e.target.value)} /></div>
                </>;
                break;
        }

        if (modalMode !== 'showdown') {
            footer = <><button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button><button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={handleManagePlayers}>Confirm</button></>;
        }

        return (
            <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} footerContent={footer}>
                {body}
            </InteractionModal>
        );
    }

    return (
        <>
            <div className="game-screen">
                <div className="player-list-container">
                    <PokerPlayerList players={players} gameState={gameState} />
                    <ActionLog messages={messages} />
                </div>
                <div className="main-content-container">
                    {renderStageDisplay()}
                    <div className="game-controls-container">
                        <button className="btn-primary" onClick={actions.startNewHand} disabled={gameStage !== 'pre-deal'}>
                            Start Next Hand
                        </button>
                        <button className="btn-secondary" onClick={() => setModalMode('addChips')} disabled={gameStage !== 'pre-deal'}>Manage Rebuys</button>
                        <button className="btn-secondary" onClick={() => setModalMode('addPlayer')} disabled={gameStage !== 'pre-deal'}>Add Player</button>
                        <button className="btn-danger" onClick={() => setModalMode('removePlayer')} disabled={gameStage !== 'pre-deal' || players.length < 1}>Remove Player</button>
                    </div>

                    {gameStage === 'pre-deal' && (
                        <div className="pre-deal-placeholder">
                            <h3>Ready to Play?</h3>
                            <p>The table is set. Use the "Manage" buttons to add players or chips before the next hand.</p>
                            <p>Click <strong>Start Next Hand</strong> to begin dealing.</p>
                        </div>
                    )}

                    {currentPlayer && gameStage !== 'pre-deal' && gameStage !== 'showdown' && (
                        <PokerRoundControls gameState={gameState} currentPlayer={currentPlayer} actions={actions} />
                    )}

                    {gameStage !== 'pre-deal' && (
                        <div className="pot-display" style={{ marginTop: 'auto', paddingTop: '2rem' }}>
                            <h2>Total Pot: ₹ {players.reduce((sum, p) => sum + p.totalPotContribution, 0)}</h2>
                        </div>
                    )}
                </div>
            </div>
            {renderModal()}
        </>
    );
};

export default PokerGameScreen;