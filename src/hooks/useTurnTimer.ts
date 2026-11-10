import { useEffect, useState } from 'react';
import { cue } from '../utils/feedback';
import { showToast } from '../utils/toast';

// Seconds left for the player on turn, restarting whenever turnKey changes; null when off.
// Ticks in the last 5 s, then an alarm, a heavy buzz and "Time's up, <Name>."; nothing else happens.
export const useTurnTimer = (seconds: number | undefined, turnKey: string | null, name: string) => {
    const [left, setLeft] = useState<{ key: string; seconds: number } | null>(null);

    useEffect(() => {
        if (!seconds || turnKey === null) return;
        const endsAt = Date.now() + seconds * 1000;
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setLeft({ key: turnKey, seconds: remaining });
            if (remaining > 0 && remaining <= 5) cue('tick');
            if (remaining === 0) {
                window.clearInterval(timer);
                cue('alarm');
                showToast({ text: `Time's up, ${name}.` });
            }
        };
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [seconds, turnKey, name]);

    if (!seconds || turnKey === null) return null;
    return left?.key === turnKey ? left.seconds : seconds;
};

export const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
