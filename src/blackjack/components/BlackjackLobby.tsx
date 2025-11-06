// teen-patti-react/src/blackjack/components/BlackjackLobby.tsx
// src/blackjack/components/BlackjackLobby.tsx
import React, { useState } from 'react';
import type { useBlackjackGame } from '../hooks/useBlackjackGame';
import BlackjackGameSetup from './BlackjackGameSetup';
import BlackjackGameScreen from './BlackjackGameScreen';
import BlackjackIntroScreen from './BlackjackIntroScreen';

interface BlackjackLobbyProps {
    blackjackHook: ReturnType<typeof useBlackjackGame>;
    onInteractionChange: (isOpen: boolean) => void; // ADDED
}

const BlackjackLobby: React.FC<BlackjackLobbyProps> = ({ blackjackHook, onInteractionChange }) => {
    const [step, setStep] = useState<'intro' | 'setup' | 'game'>('intro');
    const { gameState, actions } = blackjackHook;

    const handleLoadGame = () => {
        if (actions.loadGame()) {
            setStep('game');
            return true;
        }
        return false;
    };

    // --- UPDATED: This logic now checks for setupNewGame ---
    // If a game is in progress, go to 'game'. If hook is empty, go to 'intro'.
    if (gameState.players.length > 0 && step !== 'game') {
        setStep('game');
    } else if (gameState.players.length === 0 && step === 'game') {
        setStep('setup'); // Game was reset, go to setup
    }
    // --- END UPDATE ---


    switch (step) {
        case 'intro':
            return <BlackjackIntroScreen onStartNew={() => setStep('setup')} onLoadGame={handleLoadGame} />;
        case 'setup':
            return <BlackjackGameSetup onStartGame={(players) => {
                actions.setupGame(players);
                setStep('game');
            }} />;
        case 'game':
            return <BlackjackGameScreen 
                     blackjackHook={blackjackHook} 
                     onInteractionChange={onInteractionChange}
                     onShowSetupRequest={() => setStep('setup')} // ADDED
                   />;
    }
};

export default BlackjackLobby;