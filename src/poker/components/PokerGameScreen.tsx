// src/poker/components/PokerGameScreen.tsx
import React, { useState, useEffect } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import PokerPlayerList from './PokerPlayerList';
import PokerRoundControls from './PokerRoundControls';
import ActionLog from '../../components/ActionLog';
import InteractionModal from '../../components/InteractionModal';
import OwingsModal from '../../components/OwingsModal';
import { calculateOwings, type Transaction } from '../../utils/owingsLogic';
import { toTitleCase } from '../../utils/formatters';

interface PokerGameScreenProps {
    pokerHook: ReturnType<typeof usePokerGame>;
    onInteractionChange: (isOpen: boolean) => void;
}

type ModalMode = 'none' | 'addPlayer' | 'removePlayer' | 'addChips' | 'showdown' | 'owings' | 'toggleBreak' | 'streakWinnings';

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ pokerHook, onInteractionChange }) => {
    const { gameState, actions } = pokerHook;
    const { players, activePlayerIndex, messages, gameStage, pot } = gameState;

    const [modalMode, setModalMode] = useState<ModalMode>('none');

    const [selectedWinnerIds, setSelectedWinnerIds] = useState<Set<number>>(new Set());

    const [managePlayerId, setManagePlayerId] = useState<string>('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerStack, setAddPlayerStack] = useState('1000');
    const [addPlayerPhone, setAddPlayerPhone] = useState('');
    const [addChipsAmount, setAddChipsAmount] = useState('1000');
    const [streakAmount, setStreakAmount] = useState('50');
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const currentPlayer = activePlayerIndex > -1 ? players[activePlayerIndex] : null;

    useEffect(() => {
        if (gameStage === 'showdown' && pot.length > 0) {
            const currentPot = pot[0];
            const eligiblePlayers = Array.from(currentPot.eligiblePlayers);

            if (eligiblePlayers.length === 1) {
                actions.awardPot(0, [eligiblePlayers[0]]);
                if (modalMode === 'showdown') setModalMode('none');
            } else if (eligiblePlayers.length > 1) {
                // Pre-select all eligible players by default? Or none? Let's select none or the first.
                // Actually, if we want to allow splitting, let's start with empty or just the first.
                // Better UX: Pre-select all? No, usually one winner.
                setSelectedWinnerIds(new Set([eligiblePlayers[0]]));
                setModalMode('showdown');
            }
        } else if (gameStage !== 'showdown' && modalMode === 'showdown') {
            setModalMode('none');
        }
    }, [gameStage, pot, actions, modalMode]);

    useEffect(() => {
        const isModalOpen = modalMode !== 'none';
        onInteractionChange(isModalOpen);

        if (modalMode === 'showdown' && pot.length > 0 && pot[0].eligiblePlayers.size > 0) {
            // Already handled in the effect above, but ensuring consistency
             if (selectedWinnerIds.size === 0) {
                const eligible = Array.from(pot[0].eligiblePlayers);
                if (eligible.length > 0) setSelectedWinnerIds(new Set([eligible[0]]));
             }
        }
        if ((modalMode === 'removePlayer' || modalMode === 'addChips' || modalMode === 'toggleBreak' || modalMode === 'streakWinnings') && players.length > 0 && !managePlayerId) {
            setManagePlayerId(String(players[0].id));
        } else if (modalMode === 'addPlayer') {
            setManagePlayerId('');
            setAddPlayerName('');
            setAddPlayerStack('1000');
            setAddPlayerPhone('');
        }
    }, [modalMode, onInteractionChange, pot, players, managePlayerId]);

    const closeModal = () => {
        setModalMode('none');
    };

    const handleAwardPot = () => {
        if (selectedWinnerIds.size > 0) {
            actions.awardPot(0, Array.from(selectedWinnerIds));
        } else {
            alert("Please select at least one winner.");
        }
    };

    const toggleWinnerSelection = (id: number) => {
        const newSet = new Set(selectedWinnerIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedWinnerIds(newSet);
    };

    const handleShowOwings = () => {
        setTransactions(calculateOwings(players));
        setModalMode('owings');
    };

    const handleManagePlayers = () => {
        switch (modalMode) {
            case 'addPlayer':
                if (!addPlayerName || !addPlayerStack) return alert("Please enter name and stack.");
                if (!/^\d{10}$/.test(addPlayerPhone)) {
                    return alert('Please enter a valid 10-digit phone number.');
                }
                actions.addPlayer(addPlayerName, parseInt(addPlayerStack, 10), addPlayerPhone);
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
            case 'toggleBreak':
                if (!managePlayerId) return alert("Please select a player.");
                actions.togglePlayerBreak(parseInt(managePlayerId, 10));
                break;
            case 'streakWinnings':
                if (!managePlayerId) return alert("Please select a player.");
                if (!streakAmount || parseInt(streakAmount, 10) <= 0) return alert("Please enter a valid amount.");
                actions.applyStreakWinnings(parseInt(managePlayerId, 10), parseInt(streakAmount, 10));
                break;
        }
        closeModal();
    };

    const renderStageDisplay = () => (
        <div className="stage-display">
            <h2>{toTitleCase(gameStage)}</h2>
        </div>
    );

    const renderModal = () => {
        if (modalMode === 'none') return null;

        if (modalMode === 'owings') {
            return <OwingsModal isOpen={true} onClose={closeModal} transactions={transactions} />;
        }

        if (modalMode !== 'showdown') {
            let title = '';
            let body: React.ReactNode = null;
            let footer: React.ReactNode = null;
            let theme: 'default' | 'danger' = 'default';

            switch (modalMode) {
                case 'addPlayer':
                    title = "Add New Player";
                    body = <>
                        <div className="form-group"><label>Player Name</label><input type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div>
                        <div className="form-group"><label>Starting Stack</label><input type="number" value={addPlayerStack} onChange={e => setAddPlayerStack(e.target.value)} /></div>
                        <div className="form-group"><label>Phone Number</label><input type="tel" value={addPlayerPhone} onChange={e => setAddPlayerPhone(e.target.value)} placeholder="10 digits" /></div>
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
                case 'toggleBreak':
                    title = "Toggle Player Break";
                    body = <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)} ({p.isTakingBreak ? "On Break" : "Active"})</option>)}</select></div>;
                    break;
                case 'streakWinnings':
                    title = "Give Streak Winnings";
                    body = <>
                        <div className="form-group"><label>Select Winner</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div className="form-group"><label>Amount (from each other player)</label><input type="number" value={streakAmount} onChange={e => setStreakAmount(e.target.value)} /></div>
                        <p className="text-muted" style={{ fontSize: '0.9em', marginTop: '10px' }}>This will deduct ₹{streakAmount} from everyone else and add the total to the selected player.</p>
                    </>;
                    break;
            }

            footer = <><button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button><button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={handleManagePlayers}>Confirm</button></>;

            return <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} footerContent={footer}>{body}</InteractionModal>;
        }

        const currentPot = pot[0];
        if (!currentPot) return null;
        const eligiblePlayers = players.filter(p => currentPot.eligiblePlayers.has(p.id));
        if (eligiblePlayers.length <= 1) return null;

        const title = `Awarding Pot (${currentPot.amount})`;
        const theme = 'success';
        const body = <div className="form-group">
            <label style={{ marginBottom: '12px', display: 'block', fontWeight: 'bold' }}>Select Winner(s) to Split Pot</label>
            <div className="winner-selection-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eligiblePlayers.map(p => {
                    const isSelected = selectedWinnerIds.has(p.id);
                    return (
                        <label key={p.id} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            cursor: 'pointer', 
                            padding: '12px', 
                            background: isSelected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)', 
                            border: isSelected ? '1px solid #4CAF50' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease'
                        }}>
                            <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => toggleWinnerSelection(p.id)}
                                style={{ transform: 'scale(1.2)', cursor: 'pointer', width: 'auto', margin: 0 }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: '500', fontSize: '1.05em' }}>{toTitleCase(p.name)}</span>
                            </div>
                        </label>
                    );
                })}
            </div>
            {selectedWinnerIds.size > 1 && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.95em', color: '#aaa' }}>Pot Total: <strong style={{ color: '#fff' }}>₹{currentPot.amount}</strong></p>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', color: '#4CAF50' }}>Split: ₹{Math.floor(currentPot.amount / selectedWinnerIds.size)} each</p>
                </div>
            )}
        </div>;
        const footer = <button className="btn-modal btn-modal-primary theme-success" onClick={handleAwardPot}>Award Pot to Winner</button>;

        return <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} footerContent={footer}>{body}</InteractionModal>;
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
                    {gameStage === 'pre-deal' && (<div className="game-controls-container">
                        <button className="btn-primary" onClick={actions.startNewHand} disabled={gameStage !== 'pre-deal'}>
                            Start Next Hand
                        </button>
                        <button className="btn-secondary" onClick={() => setModalMode('addChips')} disabled={gameStage !== 'pre-deal'}>Manage Rebuys</button>
                        <button className="btn-secondary" onClick={() => setModalMode('addPlayer')} disabled={gameStage !== 'pre-deal'}>Add Player</button>
                        <button className="btn-danger" onClick={() => setModalMode('removePlayer')} disabled={gameStage !== 'pre-deal' || players.length < 1}>Remove Player</button>
                        <button className="btn-secondary" onClick={() => setModalMode('toggleBreak')} disabled={gameStage !== 'pre-deal'}>
                            Toggle Player Break
                        </button>
                        <button className="btn-success" onClick={handleShowOwings} disabled={gameStage !== 'pre-deal'}>
                            Final Owings
                        </button>
                        <button className="btn-primary" style={{ backgroundColor: '#ff9800' }} onClick={() => setModalMode('streakWinnings')}>
                            Streak Winnings
                        </button>
                    </div>)}

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