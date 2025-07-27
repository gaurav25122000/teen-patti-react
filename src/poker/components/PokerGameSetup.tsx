// src/poker/components/PokerGameSetup.tsx
import React, { useState } from 'react';
import { toTitleCase } from '../../utils/formatters';

interface PokerGameSetupProps {
    onStartGame: (players: { name: string, stack: number, phoneNumber: string }[], blinds: { sb: number, bb: number }) => void;
}

const PokerGameSetup: React.FC<PokerGameSetupProps> = ({ onStartGame }) => {
    const [players, setPlayers] = useState([{ name: '', stack: '1000', phoneNumber: '' }]);
    const [sb, setSb] = useState('10');
    const [bb, setBb] = useState('20');

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
            .filter(p => p.name.trim() !== '' && p.phoneNumber.trim() !== '')
            .map(p => ({ name: toTitleCase(p.name), stack: parseInt(p.stack) || 0, phoneNumber: p.phoneNumber }));

        if (finalPlayers.length < 2) {
            alert("Please add at least 2 players.");
            return;
        }

        const blinds = { sb: parseInt(sb), bb: parseInt(bb) };
        if (isNaN(blinds.sb) || isNaN(blinds.bb) || blinds.sb <= 0 || blinds.bb <= 0) {
            alert("Blinds must be positive numbers.");
            return;
        }

        onStartGame(finalPlayers, blinds);
    };

    return (
        <div className="setup-screen">
            <h2>Texas Hold'em Setup</h2>
            <div className="form-group">
                <label>Small Blind:</label>
                <input type="number" value={sb} onChange={e => setSb(e.target.value)} />
                <label>Big Blind:</label>
                <input type="number" value={bb} onChange={e => setBb(e.target.value)} />
            </div>
            <hr />
            {players.map((p, index) => (
                <div key={index} className="player-setup-row" style={{ margin: '5px 0' }}>
                    <input
                        type="text"
                        placeholder={`Player ${index + 1} Name`}
                        value={p.name}
                        onChange={e => handlePlayerChange(index, 'name', e.target.value)}
                    />
                    <input
                        type="number"
                        placeholder="Starting Stack"
                        value={p.stack}
                        onChange={e => handlePlayerChange(index, 'stack', e.target.value)}
                        style={{ marginLeft: "5px" }}
                    />
                    <input
                        type="text"
                        placeholder={`Player ${index + 1} Phone Number`}
                        value={p.phoneNumber}
                        onChange={e => handlePlayerChange(index, 'phoneNumber', e.target.value)}
                        style={{ marginLeft: "5px" }}
                    />
                </div>
            ))}
            <div className="setup-actions">
                <button className="btn-secondary" onClick={addPlayerField}>Add Another Player</button>
                <button className="btn btn-start rainbow-outline" onClick={handleStart}>Start Poker Game</button>
            </div>
        </div>
    );
};

export default PokerGameSetup;