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
    onDeductAndDistribute: () => void;
    onShowOwings: () => void;
    onShowSetup: () => void;
    onManageEntities: () => void;
    onTogglePlayerBreak: () => void; // ADDED
}

const GameControls: React.FC<GameControlsProps> = (props) => {
    const { 
        gameState, onStartRound, onChangeBoot, onAddPlayer, 
        onRemovePlayer, onReorderPlayers, onDeductAndDistribute, 
        onShowOwings, onShowSetup, onManageEntities, 
        onTogglePlayerBreak // ADDED
    } = props;
    const { roundActive, players, roundInitialBootAmount: lastBootAmount, lastWinnerId } = gameState;

    const canStartRound = !roundActive && players.length >= 2 && (lastBootAmount || lastWinnerId === null);
    const startRoundTitle = !canStartRound ? "Set boot amount or load game first" : "Start next round";

    return (
        <div className="game-actions">
            {canStartRound && (
                <button className="btn-primary" onClick={onStartRound} title={startRoundTitle}>
                    Start Round
                </button>
            )}
            {!roundActive && players.length >= 2 && (
                <button className="btn-secondary" onClick={onChangeBoot}>
                    Change Boot
                </button>
            )}
            {!roundActive && (
                <button className="btn-primary" onClick={onAddPlayer}>
                    Add Player
                </button>
            )}
            {!roundActive && players.length > 2 && (
                <button className="btn-secondary" onClick={onRemovePlayer}>
                    Remove Player
                </button>
            )}
            {!roundActive && players.length >= 2 && (
                <button className="btn-primary" onClick={onReorderPlayers}>
                    Reorder Players
                </button>
            )}
            {/* ADDED BUTTON */}
            {!roundActive && players.length >= 1 && (
                <button className="btn-secondary" onClick={onTogglePlayerBreak}>
                    Toggle Player Break
                </button>
            )}
            {!roundActive && players.length >= 2 && (
                <button className="btn-danger" onClick={onDeductAndDistribute}>
                    Deduct & Distribute
                </button>
            )}
            {!roundActive && (
                <button className="btn-primary" onClick={onManageEntities}>
                    Manage Entities
                </button>
            )}
            {!roundActive && (
                <button className="btn-success" onClick={onShowOwings}>
                    Final Owings
                </button>
            )}
            <button className="btn-secondary" onClick={onShowSetup}>
                Setup New Game
            </button>
        </div>
    );
};

export default GameControls;