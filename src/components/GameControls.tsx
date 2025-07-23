// src/components/GameControls.tsx

import React from 'react';
import type { GameState } from '../types/gameTypes';

interface GameControlsProps {
    gameState: GameState;
    onStartRound: () => void;
    onChangeBoot: () => void;
    onAddPlayer: () => void;
    onRemovePlayer: () => void;
    onReorderPlayers: () => void;
    onShowSetup: () => void;
    onOpenMusicPlayer: () => void;
}

const GameControls: React.FC<GameControlsProps> = (props) => {
    const { gameState, onStartRound, onChangeBoot, onAddPlayer, onRemovePlayer, onReorderPlayers, onShowSetup, onOpenMusicPlayer } = props;
    const { roundActive, players, roundInitialBootAmount: lastBootAmount, lastWinnerId } = gameState;

    const canStartRound = !roundActive && players.length >= 2 && (lastBootAmount || lastWinnerId === null);
    const startRoundTitle = !canStartRound ? "Set boot amount or load game first" : "Start next round";

    return (
        <div className="game-actions">
            <button className="btn-primary" onClick={onStartRound} disabled={!canStartRound} title={startRoundTitle}>
                Start Round
            </button>
            <button className="btn-secondary" onClick={onChangeBoot} disabled={roundActive || players.length < 2}>
                Change Boot
            </button>
            <button className="btn-primary" onClick={onAddPlayer} disabled={roundActive}>
                Add Player
            </button>
            <button className="btn-secondary" onClick={onRemovePlayer} disabled={roundActive || players.length <= 2}>
                Remove Player
            </button>
            <button className="btn-primary" onClick={onReorderPlayers} disabled={roundActive || players.length < 2}>
                Reorder Players
            </button>
            <button className="btn-secondary" onClick={onShowSetup}>
                Back to Setup
            </button>
            <button className="btn btn-accent" onClick={onOpenMusicPlayer}>
                Music
            </button>
        </div>
    );
};

export default GameControls;