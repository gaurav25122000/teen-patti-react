import React, { useEffect, useRef, useState } from 'react';
import { addedLines, soundFor, toastLine } from '../utils/logFeedback';
import { cue } from '../utils/feedback';

// The host's feedback for each state change: the added lines' toast (1.8 s, replaced by the next) and sound.
const LogFeedback: React.FC<{ messages: string[] }> = ({ messages }) => {
    const seen = useRef(messages);
    const [toast, setToast] = useState<{ text: string; id: number } | null>(null);

    useEffect(() => {
        const added = addedLines(seen.current, messages);
        seen.current = messages;
        const sound = soundFor(added);
        if (sound) cue(sound);
        const text = toastLine(added);
        if (text) setToast(t => ({ text, id: (t?.id ?? 0) + 1 }));
    }, [messages]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 1800);
        return () => window.clearTimeout(timer);
    }, [toast]);

    return toast ? <div className="action-toast" role="status" key={toast.id}>{toast.text}</div> : null;
};

export default LogFeedback;
