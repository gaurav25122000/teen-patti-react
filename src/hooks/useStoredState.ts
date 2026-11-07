import { useState } from 'react';

// A per-device preference kept in localStorage; falls back to memory when storage is blocked.
export const useStoredState = (key: string, initial: string) => {
    const [value, setValue] = useState(() => {
        try {
            return localStorage.getItem(key) ?? initial;
        } catch {
            return initial;
        }
    });
    const update = (next: string) => {
        setValue(next);
        try {
            localStorage.setItem(key, next);
        } catch { /* storage blocked: keep in memory only */ }
    };
    return [value, update] as const;
};
