import { useCallback, useState } from 'react';
import { cue } from '../utils/feedback';

// An inline form error that clears whenever a different sheet opens (or the open one closes); a refusal buzzes.
export const useFormError = (sheet = '', initial: string | null = null) => {
    const [error, setError] = useState<string | null>(initial);
    const [shownFor, setShownFor] = useState(sheet);
    if (shownFor !== sheet) {
        setShownFor(sheet);
        setError(null);
    }
    const refuse = useCallback((message: string | null) => {
        if (message) cue('error');
        setError(message);
    }, []);
    return [error, refuse] as const;
};
