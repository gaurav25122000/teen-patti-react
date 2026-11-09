import React, { useState } from 'react';
import { readSavedPlayers, type SavedPlayer } from '../utils/savedPlayers';

interface SavedPlayerChipsProps {
    formPhones: string[]; // phones already in the form are hidden
    onPick: (player: SavedPlayer) => void;
}

const SavedPlayerChips: React.FC<SavedPlayerChipsProps> = ({ formPhones, onPick }) => {
    const [saved] = useState(() => readSavedPlayers());
    const chips = saved.filter(p => !formPhones.includes(p.phone));
    if (chips.length === 0) return null;
    return (
        <div className="saved-chips">
            {chips.map(p => (
                <button key={p.phone} type="button" className="saved-chip" onClick={() => onPick(p)}>{p.name}</button>
            ))}
        </div>
    );
};

export default SavedPlayerChips;
