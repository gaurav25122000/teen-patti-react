import React, { useEffect, useState } from 'react';
import { clearPendingToast, onToast, pendingToast, type ToastData } from '../utils/toast';

// Shows the latest toast; one with text to copy stays until dismissed, and offers the text if copying fails.
const Toaster: React.FC = () => {
    const [toast, setToast] = useState<ToastData | null>(pendingToast);
    const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

    useEffect(() => onToast(next => { setToast(next); setCopy('idle'); }), []);

    useEffect(() => {
        if (!toast || toast.copyText) return;
        const timer = window.setTimeout(() => setToast(null), 3000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!toast) return null;
    const dismiss = () => {
        clearPendingToast();
        setToast(null);
    };
    const copyText = () => {
        Promise.resolve()
            .then(() => navigator.clipboard.writeText(toast.copyText!))
            .then(() => { setCopy('done'); clearPendingToast(); }, () => setCopy('failed'));
    };
    return (
        <div className="app-toast" role="status">
            <span>{copy === 'done' ? 'Settlement copied' : copy === 'failed' ? "Couldn't copy. Select the text and copy it." : toast.text}</span>
            {toast.copyText && copy === 'idle' && <button className="btn btn-primary btn-compact" onClick={copyText}>COPY</button>}
            {toast.copyText && <button className="btn btn-secondary btn-compact" onClick={dismiss} aria-label="Dismiss">✕</button>}
            {copy === 'failed' && <textarea className="toast-copy" readOnly value={toast.copyText} onFocus={e => e.target.select()} />}
        </div>
    );
};

export default Toaster;
