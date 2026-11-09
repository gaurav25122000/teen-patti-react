import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { sanitizeState } from '../utils/serialization';
import { UNDO_LINE } from '../utils/log';

// Compares game state ignoring the action log, so a rejected action (log line only) is not an undo step.
const sameGame = (a: object, b: object) =>
    JSON.stringify(sanitizeState({ ...a, messages: [] })) === JSON.stringify(sanitizeState({ ...b, messages: [] }));

/**
 * One undo step per recorded action, back to the start of the current round only:
 * a round's end saves winnings to the database, so history clears when the round ends.
 */
export const useUndo = <T extends { messages: string[] }>(
    gameState: T,
    setGameState: Dispatch<SetStateAction<T>>,
    inRound: boolean
) => {
    const [history, setHistory] = useState<T[]>([]);
    const pendingRef = useRef<T | null>(null);
    const latestRef = useRef({ gameState, inRound });
    latestRef.current = { gameState, inRound };

    useEffect(() => {
        const before = pendingRef.current;
        pendingRef.current = null;
        if (!inRound) {
            setHistory(h => (h.length > 0 ? [] : h));
        } else if (before && !sameGame(before, gameState)) {
            setHistory(h => [...h, before]);
        }
    }, [gameState, inRound]);

    // Wraps actions so each call snapshots the state it started from.
    const record = useCallback(<A extends object>(actions: A): A => {
        const wrapped: Record<string, unknown> = {};
        for (const [name, action] of Object.entries(actions)) {
            wrapped[name] = (...args: unknown[]) => {
                const { gameState: current, inRound: active } = latestRef.current;
                if (active && !pendingRef.current) pendingRef.current = current;
                return (action as (...a: unknown[]) => unknown)(...args);
            };
        }
        return wrapped as A;
    }, []);

    // For state changes that are not undo steps: drops any pending snapshot so the change is never recorded.
    const unrecorded = useCallback(<F extends (...args: never[]) => unknown>(action: F) => ((...args: Parameters<F>) => {
        pendingRef.current = null;
        return action(...args);
    }) as F, []);

    const undo = useCallback(() => {
        const previous = history[history.length - 1];
        if (!previous) return;
        setHistory(history.slice(0, -1));
        setGameState({ ...previous, messages: [...previous.messages, UNDO_LINE] });
    }, [history, setGameState]);

    return { record, unrecorded, undo, canUndo: history.length > 0 };
};
