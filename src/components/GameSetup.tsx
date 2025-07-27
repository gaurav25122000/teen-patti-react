// src/components/GameSetup.tsx

import React, { useState } from 'react';
import type { Player } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';

interface GameSetupProps {
    onStartNewGame: (players: Player[]) => void;
    onLoadGame: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStartNewGame, onLoadGame }) => {
    const [numPlayersInput, setNumPlayersInput] = useState("2");
    const [playerInputs, setPlayerInputs] = useState<{ name: string; balance: string; phoneNumber: string; }[]>([]);

    const handleConfirmNumPlayers = () => {
        const num = parseInt(numPlayersInput);
        if (isNaN(num) || num < 2) return alert("Please enter at least 2 players.");
        setPlayerInputs(Array(num).fill({ name: "", balance: "0", phoneNumber: "" }));
    };

    const handlePlayerInputChange = (index: number, field: 'name' | 'balance' | 'phoneNumber', value: string) => {
        setPlayerInputs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const handleStartGame = () => {
        const newPlayers: Player[] = [];
        for (const [index, input] of playerInputs.entries()) {
            const balance = parseInt(input.balance, 10);
            if (!input.name.trim() || isNaN(balance)) {
                return alert(`Invalid name or balance for Player ${index + 1}.`);
            }
            if (!/^\d{10}$/.test(input.phoneNumber)) {
                return alert(`Invalid phone number for Player ${index + 1}. Must be 10 digits.`);
            }
            newPlayers.push({ id: index + 1, name: toTitleCase(input.name), balance, phoneNumber: input.phoneNumber });
        }
        if (newPlayers.length < 2) return alert("Need at least 2 players.");
        onStartNewGame(newPlayers);
    };

    return (
        <div className="setup-screen">
            <h2>Game Setup</h2>
            <div className="setup-actions">
                <button className="btn-secondary" onClick={onLoadGame}>Load Saved Game</button>
            </div>
            <hr />
            <h3>Start New Game</h3>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <label>Number of Players (min 2): </label>
                <input
                    type="number"
                    min="2"
                    value={numPlayersInput}
                    onChange={(e) => setNumPlayersInput(e.target.value)}
                />
                <button className="btn-primary" onClick={handleConfirmNumPlayers}>Confirm</button>
            </div>
            {playerInputs.length > 0 && (
                <div>
                    <h4>Enter Player Details:</h4>
                    {playerInputs.map((input, index) => (
                        <div key={index} style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                placeholder={`Player ${index + 1} Name`}
                                value={input.name}
                                onChange={(e) => handlePlayerInputChange(index, 'name', e.target.value)}
                            />
                            <input
                                type="number"
                                placeholder="Balance"
                                value={input.balance}
                                onChange={(e) => handlePlayerInputChange(index, 'balance', e.target.value)}
                            />
                            <input
                                type="tel"
                                placeholder="10-Digit Phone"
                                value={input.phoneNumber}
                                onChange={(e) => handlePlayerInputChange(index, 'phoneNumber', e.target.value)}
                            />
                        </div>
                    ))}
                    <button className="btn btn-start rainbow-outline" onClick={handleStartGame} style={{ marginTop: '1rem' }}>Start Game</button>
                </div>
            )}
        </div>
    );
};

export default GameSetup;