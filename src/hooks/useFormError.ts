import { useState } from 'react';

// An inline form error that clears whenever a different sheet opens (or the open one closes).
export const useFormError = (sheet: string) => {
    const [error, setError] = useState<string | null>(null);
    const [shownFor, setShownFor] = useState(sheet);
    if (shownFor !== sheet) {
        setShownFor(sheet);
        setError(null);
    }
    return [error, setError] as const;
};
