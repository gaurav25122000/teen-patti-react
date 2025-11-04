// src/blackjack/components/BlackjackGameControls.tsx
import React from 'react';

interface BlackjackGameControlsProps {
    onStartRound: () => void;
    onShowModal: (mode: 'addPlayer' | 'removePlayer' | 'addChips' | 'toggleBreak' | 'updateHands') => void;
    onShowOwings: () => void;
    buttonText: string; // ADDED
    isButtonDisabled: boolean; // ADDED
}

const BlackjackGameControls: React.FC<BlackjackGameControlsProps> = ({ 
    onStartRound, onShowModal, onShowOwings, buttonText, isButtonDisabled 
}) => {
    return (
        <div className="game-controls-container">
            <button 
                className="btn-primary btn-action-lg" 
                onClick={onStartRound}
                disabled={isButtonDisabled} // ADDED
            >
                {buttonText} {/* UPDATED */}
            </button>
            <div className="game-actions" style={{ marginTop: '1.5rem' }}>
                <button className="btn-success" onClick={() => onShowModal('addPlayer')}>Add Player</button>
                <button className="btn-danger" onClick={() => onShowModal('removePlayer')}>Remove Player</button>
                <button className="btn-primary" onClick={() => onShowModal('addChips')}>Add Chips</button>
                <button className="btn-secondary" onClick={() => onShowModal('toggleBreak')}>Toggle Break</button>
                <button className="btn-accent" onClick={() => onShowModal('updateHands')}>Update Hands</button>
                <button 
                    className="btn-success" 
                    onClick={onShowOwings} 
                    style={{flexGrow: 1, marginTop: '0.5rem', width: '100%'}}
                >
                    Final Owings
                </button>
            </div>
        </div>
    );
};

export default BlackjackGameControls;