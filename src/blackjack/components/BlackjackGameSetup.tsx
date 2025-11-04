// src/blackjack/components/BlackjackGameSetup.tsx
import React, { useState } from 'react';
import { toTitleCase } from '../../utils/formatters';

interface BlackjackGameSetupProps {
    onStartGame: (players: { name: string, stack: number, phoneNumber: string, numHands: number }[]) => void;
}

const BlackjackGameSetup: React.FC<BlackjackGameSetupProps> = ({ onStartGame }) => {
    const [players, setPlayers] = useState([{ name: '', stack: '1000', phoneNumber: '', numHands: '1' }]);

    const handlePlayerChange = (index: number, field: 'name' | 'stack' | 'phoneNumber' | 'numHands', value: string) => {
        const newPlayers = [...players];
        newPlayers[index][field] = value;
        setPlayers(newPlayers);
    };

    const addPlayerField = () => {
        setPlayers([...players, { name: '', stack: '1000', phoneNumber: '', numHands: '1' }]);
    };

    const handleStart = () => {
        const finalPlayers = players
            .filter(p => p.name.trim() !== '')
            .map(p => ({ 
                name: toTitleCase(p.name), 
                stack: parseInt(p.stack) || 0, 
                phoneNumber: p.phoneNumber,
                numHands: parseInt(p.numHands) || 1,
                isTakingBreak: false // Ensure this is initialized
            }));

        if (finalPlayers.length < 1) {
            alert("Please add at least 1 player.");
            return;
        }

        for (const player of finalPlayers) {
            if (!/^\d{10}$/.test(player.phoneNumber)) {
                return alert(`Invalid phone number for Player ${player.name}. Must be 10 digits.`);
            }
            if (player.numHands < 1) {
                 alert(`Player ${player.name} must play at least 1 hand.`);
                 return;
            }
        }

        onStartGame(finalPlayers);
    };

    return (
        <div className="setup-screen">
            <h2>Blackjack Game Setup</h2>
            <hr />
            {players.map((p, index) => (
                <div key={index} className="player-setup-row" style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder={`Player ${index + 1} Name`}
                        value={p.name}
                        onChange={e => handlePlayerChange(index, 'name', e.target.value)}
                        style={{ flexBasis: '200px' }}
                    />
                    <input
                        type="number"
                        placeholder="Starting Stack"
                        value={p.stack}
                        onChange={e => handlePlayerChange(index, 'stack', e.target.value)}
                         style={{ flexBasis: '120px' }}
                    />
                    <input
                        type="tel"
                        placeholder="10-Digit Phone"
                        value={p.phoneNumber}
                        onChange={(e) => handlePlayerChange(index, 'phoneNumber', e.target.value)}
                         style={{ flexBasis: '150px' }}
                    />
                    <label style={{ marginLeft: '1rem' }}>Hands:</label>
                    <input
                        type="number"
                        title="Number of hands to play simultaneously"
                        min="1"
                        value={p.numHands}
                        onChange={(e) => handlePlayerChange(index, 'numHands', e.target.value)}
                        style={{ flexBasis: '80px' }}
                    />
                </div>
            ))}
            <div className="setup-actions">
                <button className="btn-secondary" onClick={addPlayerField}>Add Another Player</button>
                <button className="btn btn-start rainbow-outline" onClick={handleStart}>Start Blackjack Game</button>
            </div>
        </div>
    );
};

export default BlackjackGameSetup;