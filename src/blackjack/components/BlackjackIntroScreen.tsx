// src/blackjack/components/BlackjackIntroScreen.tsx
import React from 'react';

interface BlackjackIntroScreenProps {
    onStartNew: () => void;
    onLoadGame: () => boolean;
}

const BlackjackIntroScreen: React.FC<BlackjackIntroScreenProps> = ({ onStartNew, onLoadGame }) => {
    return (
        <div className="setup-screen">
            <h2>Blackjack Bets Manager</h2>
            <p>Load a previous session or start a new game.</p>
            <div className="setup-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                <button className="btn btn-secondary" style={{ padding: '15px 30px', fontSize: '1.2rem' }} onClick={onLoadGame}>
                    Load Saved Game
                </button>
                <button className="btn-primary" style={{ padding: '15px 30px', fontSize: '1.2rem' }} onClick={onStartNew}>
                    Start New Game
                </button>
            </div>
        </div>
    );
};

export default BlackjackIntroScreen;