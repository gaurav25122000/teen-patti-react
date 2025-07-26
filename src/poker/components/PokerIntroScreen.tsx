// src/poker/components/PokerIntroScreen.tsx
import React from 'react';

interface PokerIntroScreenProps {
    onStartNew: () => void;
    onLoadGame: () => boolean;
}

const PokerIntroScreen: React.FC<PokerIntroScreenProps> = ({ onStartNew, onLoadGame }) => {
    return (
        <div className="setup-screen">
            <h2>Poker Bets Manager</h2>
            <p>Load a previous session or start a new game.</p>
            <div className="setup-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                <button className="btn btn-secondary" style={{ padding: '15px 30px', fontSize: '1.2rem' }} onClick={onLoadGame}>
                    Load Saved Game
                </button>
                <button className="btn btn-primary" style={{ padding: '15px 30px', fontSize: '1.2rem' }} onClick={onStartNew}>
                    Start New Game
                </button>
            </div>
        </div>
    );
};

export default PokerIntroScreen;