// src/poker/components/PokerGameSetup.tsx
import React, { useState } from 'react';
import { toTitleCase } from '../../utils/formatters';
import { duplicatePhone, fillRow } from '../../utils/savedPlayers';
import SavedPlayerChips from '../../components/SavedPlayerChips';
import SettingsFields from '../../components/SettingsFields';
import { parsePoker, type PokerSettings } from '../../utils/gameSettings';
import { pokerFields } from '../../utils/settingsFields';
import { buyInRefusal } from '../engine';

interface PokerGameSetupProps {
    onStartGame: (players: { name: string, stack: number, phoneNumber: string }[], settings: PokerSettings) => void;
}

// Always shown: the blinds, and in a tournament the buy-in and starting chips. The rest sits in "Table settings".
const SHOWN = ['smallBlindAmount', 'bigBlindAmount', 'buyIn', 'startingChips'];

const PokerGameSetup: React.FC<PokerGameSetupProps> = ({ onStartGame }) => {
    const [players, setPlayers] = useState([{ name: '', stack: '1000', phoneNumber: '' }]);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<Record<string, string>>({ smallBlindAmount: '10', bigBlindAmount: '20', buyIn: '500', startingChips: '1000' });
    const tournament = form.tournament === 'on';
    const fields = pokerFields(tournament);

    const handlePlayerChange = (index: number, field: 'name' | 'stack' | 'phoneNumber', value: string) => {
        const newPlayers = [...players];
        newPlayers[index][field] = value;
        setPlayers(newPlayers);
    };

    const addPlayerField = () => {
        setPlayers([...players, { name: '', stack: '1000', phoneNumber: '' }]);
    };

    const handleStart = () => {
        const finalPlayers = players
            .filter(p => p.name.trim() !== '')
            .map(p => ({ name: toTitleCase(p.name), stack: Number(p.stack) || 0, phoneNumber: p.phoneNumber.trim() }));

        if (finalPlayers.length < 2) {
            return setError("Please add at least 2 players.");
        }

        for (const player of finalPlayers) {
            if (!/^\d{10}$/.test(player.phoneNumber)) {
                return setError(`Invalid phone number for Player ${player.name}. Must be 10 digits.`);
            }
        }
        const dup = duplicatePhone(finalPlayers.map(p => p.phoneNumber));
        if (dup) return setError(`Two players have the phone ${dup}.`);

        const settings = parsePoker(form);
        if (typeof settings === 'string') return setError(settings);
        const limit = tournament ? null : finalPlayers.map(p => buyInRefusal(settings, p.stack)).find(Boolean);
        if (limit) return setError(limit);

        onStartGame(finalPlayers, settings);
    };

    return (
        <div className="setup-screen">
            <h2>Texas Hold'em Setup</h2>
            <div className="mode-switch" role="radiogroup" aria-label="Game type">
                <label><input type="radio" name="poker-mode" checked={!tournament} onChange={() => setForm({ ...form, tournament: '' })} /> Cash game</label>
                <label><input type="radio" name="poker-mode" checked={tournament} onChange={() => setForm({ ...form, tournament: 'on' })} /> Tournament</label>
            </div>
            <SettingsFields fields={fields.filter(f => SHOWN.includes(f.key))} form={form} onChange={setForm} />
            <details className="table-settings">
                <summary>Table settings</summary>
                <SettingsFields fields={fields.filter(f => !SHOWN.includes(f.key))} form={form} onChange={setForm} />
            </details>
            <hr />
            <SavedPlayerChips
                formPhones={players.map(p => p.phoneNumber)}
                onPick={picked => setPlayers(rows => fillRow(rows, picked, { name: '', stack: '1000', phoneNumber: '' }))}
            />
            {players.map((p, index) => (
                <div key={index} className="player-setup-row">
                    <input
                        type="text"
                        placeholder={`Player ${index + 1} Name`}
                        value={p.name}
                        onChange={e => handlePlayerChange(index, 'name', e.target.value)}
                    />
                    {!tournament && <input
                        type="number" inputMode="decimal"
                        placeholder="Starting Stack"
                        value={p.stack}
                        onChange={e => handlePlayerChange(index, 'stack', e.target.value)}
                    />}
                    <input
                        type="tel"
                        placeholder="10-Digit Phone"
                        value={p.phoneNumber}
                        onChange={(e) => handlePlayerChange(index, 'phoneNumber', e.target.value)}
                    />
                    {players.length > 1 && <button className="btn btn-error btn-compact seat-remove" aria-label={`Remove seat ${index + 1}`} onClick={() => setPlayers(rows => rows.filter((_, i) => i !== index))}>✕</button>}
                </div>
            ))}
            <div className="setup-actions">
                <button className="btn-violet" onClick={addPlayerField}>Add seat</button>
                <button className="btn btn-start rainbow-outline" onClick={handleStart}>Start Poker Game</button>
                {error && <p className="form-error">{error}</p>}
            </div>
        </div>
    );
};

export default PokerGameSetup;