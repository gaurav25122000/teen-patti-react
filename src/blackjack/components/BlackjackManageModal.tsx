// src/blackjack/components/BlackjackManageModal.tsx
import React, { useState, useEffect } from 'react';
import type { BlackjackPlayer } from '../types/blackjackGameTypes';
import InteractionModal from '../../components/InteractionModal';
import { toTitleCase } from '../../utils/formatters';

export type ModalMode = 'none' | 'addPlayer' | 'removePlayer' | 'addChips' | 'toggleBreak' | 'updateHands';

interface BlackjackManageModalProps {
    isOpen: boolean;
    mode: ModalMode;
    players: BlackjackPlayer[];
    onClose: () => void; // <<< THIS WAS THE FIX
    onAddPlayer: (name: string, stack: number, phone: string, numHands: number) => void;
    onRemovePlayer: (playerId: number) => void;
    onAddChips: (playerId: number, amount: number) => void;
    onToggleBreak: (playerId: number) => void;
    onUpdateHands: (playerId: number, numHands: number) => void;
}

const BlackjackManageModal: React.FC<BlackjackManageModalProps> = ({
    isOpen, mode, players, onClose,
    onAddPlayer, onRemovePlayer, onAddChips, onToggleBreak, onUpdateHands
}) => {
    const [managePlayerId, setManagePlayerId] = useState<string>('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerStack, setAddPlayerStack] = useState('1000');
    const [addPlayerPhone, setAddPlayerPhone] = useState('');
    const [addPlayerNumHands, setAddPlayerNumHands] = useState('1');
    const [addChipsAmount, setAddChipsAmount] = useState('1000');
    const [updateNumHands, setUpdateNumHands] = useState('1');

    useEffect(() => {
        if (isOpen && players.length > 0 && !managePlayerId) {
            setManagePlayerId(String(players[0].id));
        }
        if (mode === 'updateHands' && managePlayerId) {
             const player = players.find(p => p.id === Number(managePlayerId));
             if(player) setUpdateNumHands(String(player.initialHandsCount));
        }
    }, [isOpen, mode, players, managePlayerId]);
    
    useEffect(() => {
        if (managePlayerId) {
             const player = players.find(p => p.id === Number(managePlayerId));
             if(player) setUpdateNumHands(String(player.initialHandsCount));
        }
    }, [managePlayerId, players]);

    if (mode === 'none') return null;

    let title = '';
    let body: React.ReactNode = null;
    let footer: React.ReactNode = null;
    let theme: 'default' | 'danger' = 'default';
    let confirmAction = () => {};

    const playerOptions = players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>);
    const playerBreakOptions = players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)} ({p.isTakingBreak ? "On Break" : "Active"})</option>);

    switch (mode) {
        case 'addPlayer':
            title = "Add New Player";
            body = <>
                <div className="form-group"><label>Player Name</label><input type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div>
                <div className="form-group"><label>Starting Stack</label><input type="number" value={addPlayerStack} onChange={e => setAddPlayerStack(e.target.value)} /></div>
                <div className="form-group"><label>Phone Number</label><input type="tel" value={addPlayerPhone} onChange={e => setAddPlayerPhone(e.target.value)} placeholder="10 digits" /></div>
                <div className="form-group"><label>Number of Hands</label><input type="number" min="1" value={addPlayerNumHands} onChange={e => setAddPlayerNumHands(e.target.value)} /></div>
            </>;
            confirmAction = () => {
                 if (!addPlayerName || !addPlayerStack) return alert("Please enter name and stack.");
                if (!/^\d{10}$/.test(addPlayerPhone)) {
                    return alert('Please enter a valid 10-digit phone number.');
                }
                onAddPlayer(addPlayerName, parseInt(addPlayerStack, 10), addPlayerPhone, parseInt(addPlayerNumHands, 10));
                onClose();
            };
            break;
        case 'removePlayer':
            title = "Remove Player";
            theme = 'danger';
            body = <div className="form-group"><label>Select Player to Remove</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{playerOptions}</select></div>;
            confirmAction = () => {
                if (!managePlayerId) return alert("Please select a player.");
                onRemovePlayer(parseInt(managePlayerId, 10));
                setManagePlayerId('');
                onClose();
            };
            break;
        case 'addChips':
            title = "Add Chips (Rebuy)";
            body = <>
                <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{playerOptions}</select></div>
                <div className="form-group"><label>Amount to Add</label><input type="number" value={addChipsAmount} onChange={e => setAddChipsAmount(e.target.value)} /></div>
            </>;
            confirmAction = () => {
                if (!managePlayerId) return alert("Please select a player.");
                onAddChips(parseInt(managePlayerId, 10), parseInt(addChipsAmount, 10));
                onClose();
            };
            break;
        case 'toggleBreak':
            title = "Toggle Player Break";
            body = <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{playerBreakOptions}</select></div>;
            confirmAction = () => {
                 if (!managePlayerId) return alert("Please select a player.");
                onToggleBreak(parseInt(managePlayerId, 10));
                onClose();
            };
            break;
        case 'updateHands':
            title = "Update Player Hands";
            body = <>
                <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{playerOptions}</select></div>
                <div className="form-group"><label>New Number of Hands</label><input type="number" min="1" value={updateNumHands} onChange={e => setUpdateNumHands(e.target.value)} /></div>
            </>;
            confirmAction = () => {
                 if (!managePlayerId) return alert("Please select a player.");
                 onUpdateHands(parseInt(managePlayerId, 10), parseInt(updateNumHands, 10));
                 onClose();
            };
            break;
    }

    footer = <><button className="btn-modal btn-modal-secondary" onClick={onClose}>Cancel</button><button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={confirmAction}>Confirm</button></>;

    return <InteractionModal isOpen={true} onClose={onClose} title={title} theme={theme} footerContent={footer}>{body}</InteractionModal>;
};

export default BlackjackManageModal;