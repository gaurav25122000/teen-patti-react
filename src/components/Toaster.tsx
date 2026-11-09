import React, { useEffect, useState } from 'react';
import { onToast, type ToastData } from '../utils/toast';

// Shows the latest toast; one with text to copy stays until dismissed.
const Toaster: React.FC = () => {
    const [toast, setToast] = useState<ToastData | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => onToast(next => { setToast(next); setCopied(false); }), []);

    useEffect(() => {
        if (!toast || toast.copyText) return;
        const timer = window.setTimeout(() => setToast(null), 3000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!toast) return null;
    const copy = () => {
        Promise.resolve()
            .then(() => navigator.clipboard.writeText(toast.copyText!))
            .then(() => setCopied(true), () => setToast({ text: "Couldn't copy." }));
    };
    return (
        <div className="app-toast" role="status">
            <span>{copied ? 'Settlement copied' : toast.text}</span>
            {toast.copyText && !copied && <button className="btn-sm" onClick={copy}>COPY</button>}
            {toast.copyText && <button className="btn-sm" onClick={() => setToast(null)} aria-label="Dismiss">✕</button>}
        </div>
    );
};

export default Toaster;
