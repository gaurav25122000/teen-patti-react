import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { LOG_LIMIT, mergeLog } from '../utils/log';

/**
 * useState for a game's state, plus addMessage and afterCommit for use inside setGameState updaters:
 * a nested setState there is dropped and updaters can re-run, so lines and side effects are collected per update.
 */
// roundMoney: the game's paise rounding, applied to every state an update changes.
export const useGameState = <S extends { messages: string[] }>(initial: S | (() => S), roundMoney?: (s: S) => S) => {
    const [gameState, setRawGameState] = useState<S>(initial);
    const writtenRef = useRef<string[] | null>(null);
    const effectsRef = useRef<(() => void)[] | null>(null);
    // Keyed per setGameState call, so a re-run of the same updater replaces its effects instead of adding more.
    const queuedRef = useRef(new Map<object, (() => void)[]>());

    const setGameState = useCallback((action: SetStateAction<S>) => {
        const update = {};
        setRawGameState(prev => {
            writtenRef.current = [];
            effectsRef.current = [];
            try {
                const stepped = typeof action === 'function' ? (action as (state: S) => S)(prev) : action;
                const next = roundMoney && stepped !== prev ? roundMoney(stepped) : stepped;
                if (effectsRef.current.length > 0) queuedRef.current.set(update, effectsRef.current);
                else queuedRef.current.delete(update);
                const written = writtenRef.current;
                return written.length === 0 ? next : { ...next, messages: mergeLog(prev.messages, next.messages, written) };
            } finally {
                writtenRef.current = null;
                effectsRef.current = null;
            }
        });
    }, [roundMoney]);

    const addMessage = useCallback((message: string) => {
        if (writtenRef.current) {
            writtenRef.current.push(message);
        } else {
            setRawGameState(prev => ({ ...prev, messages: [...prev.messages, message].slice(-LOG_LIMIT) }));
        }
    }, []);

    // Runs a side effect (a database write) once the update commits; immediately when called outside an updater.
    const afterCommit = useCallback((effect: () => void) => {
        if (effectsRef.current) effectsRef.current.push(effect);
        else effect();
    }, []);

    useEffect(() => {
        const effects = [...queuedRef.current.values()].flat();
        queuedRef.current.clear();
        effects.forEach(effect => effect());
    }, [gameState]);

    return [gameState, setGameState, addMessage, afterCommit] as const;
};
