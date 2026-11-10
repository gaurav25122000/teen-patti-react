import React from 'react';
import { AVATAR_COLORS, avatarColor, initials, type SavedPlayer } from '../utils/savedPlayers';

interface AvatarProps {
    name: string;
    phone?: string;
    saved?: SavedPlayer[]; // looked up by phone for the player's own colour and emoji
}

// A coloured circle with the player's emoji, or else their initials.
const Avatar: React.FC<AvatarProps> = ({ name, phone, saved }) => {
    const own = phone ? saved?.find(p => p.phone === phone) : undefined;
    const color = AVATAR_COLORS[avatarColor({ name, phone: phone ?? '', color: own?.color })];
    return (
        <span className="avatar" style={{ background: color }} aria-hidden="true">
            {own?.emoji ?? initials(name)}
        </span>
    );
};

export default Avatar;
