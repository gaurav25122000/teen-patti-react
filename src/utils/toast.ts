// App-wide toasts: anything can raise one; the Toaster in App shows it.
export interface ToastData {
    text: string;
    copyText?: string; // offers COPY, e.g. a settlement that could not be saved
}

const EVENT = 'bets-toast';
const PENDING_KEY = 'bets-pending-toast';

// A toast with text to copy also survives a reload (a handover navigates away) until it is dismissed.
export const showToast = (toast: ToastData) => {
    if (toast.copyText) {
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(toast)); } catch { /* storage blocked: this page only */ }
    }
    window.dispatchEvent(new CustomEvent<ToastData>(EVENT, { detail: toast }));
};

export const pendingToast = (): ToastData | null => {
    try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
        return typeof saved?.text === 'string' && typeof saved?.copyText === 'string' ? saved : null;
    } catch {
        return null;
    }
};

export const clearPendingToast = () => {
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
};

export const onToast = (listener: (toast: ToastData) => void) => {
    const handle = (e: Event) => listener((e as CustomEvent<ToastData>).detail);
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
};
