// src/poker/components/PokerLobby.tsx
import React, { useEffect, useState } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import PokerGameSetup from './PokerGameSetup';
import PokerGameScreen from './PokerGameScreen';
import PokerIntroScreen from './PokerIntroScreen';
import { isHandoverArrival } from '../../utils/hostHandover';

interface PokerLobbyProps {
    pokerHook: ReturnType<typeof usePokerGame>;
    onInteractionChange: (isOpen: boolean) => void;
}

const PokerLobby: React.FC<PokerLobbyProps> = ({ pokerHook, onInteractionChange }) => {
    const [pokerStep, setPokerStep] = useState<'intro' | 'setup' | 'game'>('intro');
    const { gameState: pokerState, actions: pokerActions } = pokerHook;

    const handleLoadPokerGame = () => {
        if (pokerActions.loadGame()) {
            setPokerStep('game');
            return true;
        }
        return false;
    };

    // A phone taking over hosting arrives with its saved game already written.
    useEffect(() => {
        if (isHandoverArrival() && pokerActions.loadGame()) setPokerStep('game');
    }, [pokerActions]);

    // If a game is already in progress (e.g., loaded from storage), go straight to the game.
    if (pokerState.players.length > 0 && pokerStep !== 'setup') {
        return <PokerGameScreen pokerHook={pokerHook} onInteractionChange={onInteractionChange} />;
    }

    // Otherwise, manage the setup flow.
    switch (pokerStep) {
        case 'intro':
            return <PokerIntroScreen onStartNew={() => setPokerStep('setup')} onLoadGame={handleLoadPokerGame} />;
        case 'setup':
            return <PokerGameSetup onStartGame={(players, blinds) => {
                pokerActions.setupGame(players, blinds);
                setPokerStep('game');
            }} />;
        case 'game':
             // This case is hit if a user tries to load an empty/invalid game.
            return <PokerIntroScreen onStartNew={() => setPokerStep('setup')} onLoadGame={handleLoadPokerGame} />;
    }
};

export default PokerLobby;