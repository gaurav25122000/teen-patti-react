// src/components/GameSelection.tsx
import React from 'react';

interface GameSelectionProps {
    onSelectGame: (gameType: 'normal' | 'poker') => void;
}

const GameSelection: React.FC<GameSelectionProps> = ({ onSelectGame }) => {
    return (
        <div className="setup-screen">
            <h2>Choose Game Type</h2>
            <div className="setup-actions">
                <button className="btn-primary" onClick={() => onSelectGame('normal')}>
                    Normal Bets Manager
                </button>
                <button className="btn-primary" onClick={() => onSelectGame('poker')} style={{ marginLeft: '10px' }}>
                    Poker Table Bets Manager
                </button>
            </div>
        </div>
    );
};

export default GameSelection;
