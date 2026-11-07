import React, { useEffect, useRef, useState } from 'react';
import './Celebration.css';
import { WIN_PATTERN } from '../utils/winPattern';

const COLORS = ['var(--color-glow-cyan)', 'var(--color-glow-magenta)', 'var(--color-glow-gold)', 'var(--color-glow-lime)'];
const PIECES = Array.from({ length: 40 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 10) * 0.12}s`,
    background: COLORS[i % COLORS.length],
}));

// Driven by the action log, so host and stream viewers celebrate the same wins.
const Celebration: React.FC<{ messages: string[] }> = ({ messages }) => {
    const [banner, setBanner] = useState<string | null>(null);
    const lastSeenRef = useRef(messages[messages.length - 1] ?? null);

    useEffect(() => {
        let win: string | null = null;
        for (let i = messages.length - 1; i >= 0 && messages.length - 1 - i < 10; i--) {
            if (messages[i] === lastSeenRef.current) break;
            if (!win && WIN_PATTERN.test(messages[i])) win = messages[i];
        }
        lastSeenRef.current = messages[messages.length - 1] ?? null;
        if (!win) return;
        setBanner(win);
        const timer = setTimeout(() => setBanner(null), 4000);
        return () => clearTimeout(timer);
    }, [messages]);

    if (!banner) return null;
    return (
        <div className="celebration" aria-live="polite">
            {PIECES.map((piece, i) => (
                <span key={i} className="confetti-piece" style={{ left: piece.left, animationDelay: piece.delay, background: piece.background }} />
            ))}
            <div className="celebration-banner">🏆 {banner}</div>
        </div>
    );
};

export default Celebration;
