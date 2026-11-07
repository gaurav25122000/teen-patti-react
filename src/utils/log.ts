export const LOG_LIMIT = 101;
export const UNDO_LINE = '↩ Last action undone.';

/**
 * Puts log lines written during a state update into that update's log: before the lines the update
 * appended itself when it kept the previous log as a prefix, otherwise at the end. Keeps the last LOG_LIMIT.
 */
export const mergeLog = (prev: string[], next: string[], written: string[]): string[] => {
    if (written.length === 0) return next;
    const keepsPrev = next.length >= prev.length && prev.every((line, i) => next[i] === line);
    const merged = keepsPrev ? [...prev, ...written, ...next.slice(prev.length)] : [...next, ...written];
    return merged.slice(-LOG_LIMIT);
};
