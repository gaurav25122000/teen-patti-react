import { useEffect } from 'react';

// Keeps the screen on while active (Screen Wake Lock API), asking again when the tab is shown again.
export const useWakeLock = (active: boolean) => {
    useEffect(() => {
        if (!active || !('wakeLock' in navigator)) return;
        let lock: WakeLockSentinel | null = null;
        let stopped = false;
        const request = () => {
            if (document.visibilityState !== 'visible') return;
            navigator.wakeLock.request('screen').then(l => {
                if (stopped) l.release();
                else lock = l;
            }, err => console.error('Wake lock refused:', err));
        };
        request();
        document.addEventListener('visibilitychange', request);
        return () => {
            stopped = true;
            document.removeEventListener('visibilitychange', request);
            lock?.release();
        };
    }, [active]);
};
