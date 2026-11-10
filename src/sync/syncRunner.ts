// Runs sync in the app: at start, 2 s after the last local change, and on SYNC NOW. One run at a time.
import { syncOnce, failureText, syncedAt, type SyncDeps } from './syncClient';
import { joinCode, keyFromCode } from './syncCrypto';
import { LOCAL_CHANGE } from '../utils/localChange';

const KEY_STORAGE = 'bets-sync-key';
const DEBOUNCE_MS = 2000;

let status = 'Not in a group';
const listeners = new Set<(text: string) => void>();
const setStatus = (text: string) => {
    status = text;
    listeners.forEach(listener => listener(text));
};

export const currentStatus = () => status;
export const onStatus = (listener: (text: string) => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const groupKey = (): Uint8Array | null => {
    try {
        return keyFromCode(localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
        return null;
    }
};

export const groupCode = () => {
    const key = groupKey();
    return key ? joinCode(key) : null;
};

const deps: SyncDeps = {
    post: async (fn, body) => {
        const res = await fetch(`/.netlify/functions/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json().catch(() => null) };
    },
    storage: localStorage,
    now: Date.now,
};

let running = false;
let again = false;

export const syncNow = async () => {
    const key = groupKey();
    if (!key) return setStatus('Not in a group');
    if (running) {
        again = true;
        return;
    }
    running = true;
    setStatus('Syncing…');
    try {
        await syncOnce(key, deps);
        setStatus(syncedAt(Date.now()));
    } catch (error) {
        console.error('Sync failed:', error);
        setStatus(failureText(error));
    } finally {
        running = false;
        if (again) {
            again = false;
            void syncNow();
        }
    }
};

export const joinGroup = (key: Uint8Array) => {
    localStorage.setItem(KEY_STORAGE, joinCode(key));
    void syncNow();
};

// Forgets the key; this phone's data stays.
export const leaveGroup = () => {
    localStorage.removeItem(KEY_STORAGE);
    setStatus('Not in a group');
};

// Call once at app start. Local changes made by a sync itself don't start another.
export const startSync = () => {
    let timer: number | undefined;
    const onChange = () => {
        if (running || !groupKey()) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void syncNow(), DEBOUNCE_MS);
    };
    window.addEventListener(LOCAL_CHANGE, onChange);
    void syncNow();
    return () => {
        window.removeEventListener(LOCAL_CHANGE, onChange);
        window.clearTimeout(timer);
    };
};
