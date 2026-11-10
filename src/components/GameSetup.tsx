// src/components/GameSetup.tsx

import React, { useState } from 'react';
import type { Player } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';
import { duplicatePhone, fillRow } from '../utils/savedPlayers';
import { parseTeenPatti, type TeenPattiSettings } from '../utils/gameSettings';
import { TEEN_PATTI_FIELDS } from '../utils/settingsFields';
import SavedPlayerChips from './SavedPlayerChips';
import SettingsFields from './SettingsFields';

interface GameSetupProps {
    onStartNewGame: (players: Player[], settings: TeenPattiSettings) => void;
    onLoadGame: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStartNewGame, onLoadGame }) => {
    const emptySeat = { name: '', balance: '0', phoneNumber: '' };
    const [playerInputs, setPlayerInputs] = useState<{ name: string; balance: string; phoneNumber: string; }[]>([emptySeat, emptySeat]);
    const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

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
            const balance = Number(input.balance);
            if (!input.name.trim() || isNaN(balance)) {
                return setError(`Invalid name or balance for Player ${index + 1}.`);
            }
            const phoneNumber = input.phoneNumber.trim();
            if (!/^\d{10}$/.test(phoneNumber)) {
                return setError(`Invalid phone number for Player ${index + 1}. Must be 10 digits.`);
            }
            newPlayers.push({ id: index + 1, name: toTitleCase(input.name), balance, phoneNumber, isTakingBreak: false });
        }
        if (newPlayers.length < 2) return setError("Need at least 2 players.");
        const dup = duplicatePhone(newPlayers.map(p => p.phoneNumber ?? ''));
        if (dup) return setError(`Two players have the phone ${dup}.`);
        const settings = parseTeenPatti(settingsForm);
        if (typeof settings === 'string') return setError(settings);
        onStartNewGame(newPlayers, settings);
    };

    return (
        <div className="setup-screen">
            <h2>Game Setup</h2>
            <div className="setup-actions">
                <button className="btn-secondary" onClick={onLoadGame}>Load Saved Game</button>
            </div>
            <hr />
            <h3>Start New Game</h3>
            <details className="table-settings">
                <summary>Table settings</summary>
                <SettingsFields fields={TEEN_PATTI_FIELDS} form={settingsForm} onChange={setSettingsForm} />
            </details>

            <SavedPlayerChips
                formPhones={playerInputs.map(p => p.phoneNumber)}
                onPick={picked => setPlayerInputs(rows => fillRow(rows, picked, emptySeat))}
            />
            <div>
                    <h4>Enter Player Details:</h4>
                    {playerInputs.map((input, index) => (
                        <div key={index} className="player-setup-row">
                            <input
                                type="text"
                                placeholder={`Player ${index + 1} Name`}
                                value={input.name}
                                onChange={(e) => handlePlayerInputChange(index, 'name', e.target.value)}
                            />
                            <input
                                type="number" inputMode="decimal"
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
                            {playerInputs.length > 2 && <button className="btn btn-error btn-compact seat-remove" aria-label={`Remove seat ${index + 1}`} onClick={() => setPlayerInputs(rows => rows.filter((_, i) => i !== index))}>✕</button>}
                        </div>
                    ))}
                    <div className="setup-actions">
                        <button className="btn-violet" onClick={() => setPlayerInputs(rows => [...rows, emptySeat])}>Add seat</button>
                        <button className="btn btn-start rainbow-outline" onClick={handleStartGame}>Start Game</button>
                        {error && <p className="form-error">{error}</p>}
                    </div>
            </div>
        </div>
    );
};

export default GameSetup;