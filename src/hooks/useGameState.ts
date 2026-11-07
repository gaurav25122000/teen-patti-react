import { useCallback, useRef, useState, type SetStateAction } from 'react';
import { LOG_LIMIT, mergeLog } from '../utils/log';

/**
 * useState for a game's state plus addMessage. The hooks call addMessage inside setGameState updaters,
 * where a nested setState is dropped, so lines written there are collected into that same update.
 */
export const useGameState = <S extends { messages: string[] }>(initial: S | (() => S)) => {
    const [gameState, setRawGameState] = useState<S>(initial);
    const writtenRef = useRef<string[] | null>(null);

    const setGameState = useCallback((action: SetStateAction<S>) => {
        setRawGameState(prev => {
            writtenRef.current = [];
            try {
                const next = typeof action === 'function' ? (action as (state: S) => S)(prev) : action;
                const written = writtenRef.current;
                return written.length === 0 ? next : { ...next, messages: mergeLog(prev.messages, next.messages, written) };
            } finally {
                writtenRef.current = null;
            }
        });
    }, []);

    const addMessage = useCallback((message: string) => {
        if (writtenRef.current) {
            writtenRef.current.push(message);
        } else {
            setRawGameState(prev => ({ ...prev, messages: [...prev.messages, message].slice(-LOG_LIMIT) }));
        }
    }, []);

    return [gameState, setGameState, addMessage] as const;
};
