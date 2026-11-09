// App-wide toasts: anything can raise one; the Toaster in App shows it.
export interface ToastData {
    text: string;
    copyText?: string; // offers COPY, e.g. a settlement that could not be saved
}

const EVENT = 'bets-toast';

export const showToast = (toast: ToastData) => window.dispatchEvent(new CustomEvent<ToastData>(EVENT, { detail: toast }));

export const onToast = (listener: (toast: ToastData) => void) => {
    const handle = (e: Event) => listener((e as CustomEvent<ToastData>).detail);
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
};
