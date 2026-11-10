import React, { useState } from 'react';
import { chipPlayers, readSavedPlayers, type SavedPlayer } from '../utils/savedPlayers';
import Avatar from './Avatar';

interface SavedPlayerChipsProps {
    formPhones: string[]; // phones already in the form are hidden
    onPick: (player: SavedPlayer) => void;
}

const SavedPlayerChips: React.FC<SavedPlayerChipsProps> = ({ formPhones, onPick }) => {
    const [saved] = useState(() => readSavedPlayers());
    const chips = chipPlayers(saved, formPhones);
    if (chips.length === 0) return null;
    return (
        <div className="saved-chips">
            {chips.map(p => (
                <button key={p.phone} type="button" className="saved-chip" onClick={() => onPick(p)}><Avatar name={p.name} phone={p.phone} saved={saved} /> {p.name}</button>
            ))}
        </div>
    );
};

export default SavedPlayerChips;
