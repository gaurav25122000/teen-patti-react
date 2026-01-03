export const sanitizeState = (state: any): any => {
    if (state instanceof Set) {
        return Array.from(state);
    }
    if (Array.isArray(state)) {
        return state.map(item => sanitizeState(item));
    }
    if (state !== null && typeof state === 'object') {
        const newState: any = {};
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                // If it's a Set, we mark it specially or just convert?
                // Simple conversion to array is enough for JSON, 
                // but for rehydration we need to know what to convert back.
                // WE will check key names for known Set fields.
                newState[key] = sanitizeState(state[key]);
            }
        }
        return newState;
    }
    return state;
};

// We need to know which keys should be Sets. 
// Known Set keys in our app: 'eligiblePlayers', 'blindPlayerIds', 'foldedPlayerIds'
const SET_KEYS = new Set(['eligiblePlayers', 'blindPlayerIds', 'foldedPlayerIds']);

export const rehydrateState = (state: any): any => {
    if (Array.isArray(state)) {
        return state.map(item => rehydrateState(item));
    }
    if (state !== null && typeof state === 'object') {
        const newState: any = {};
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                const value = state[key];
                
                if (SET_KEYS.has(key) && Array.isArray(value)) {
                    newState[key] = new Set(value);
                } else {
                    newState[key] = rehydrateState(value);
                }
            }
        }
        return newState;
    }
    return state;
};
