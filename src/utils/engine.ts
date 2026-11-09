import { mergeLog } from './log.ts';

// A Lifetime Winnings row before hashing: the hook hashes the phone and stamps the time.
export interface RawRecord {
    phone: string;
    name: string;
    winnings: number;
}

// What a pure game step may do besides returning the next state.
export interface Io {
    log: (line: string) => void; // a log line written during this step
    records: (rows: RawRecord[]) => void; // Lifetime Winnings rows to send once the step commits
    now: () => number;
}

// Runs one step outside React (tests and simulations), placing written lines as useGameState does.
export const runStep = <S extends { messages: string[] }>(prev: S, step: (s: S, io: Io) => S, now: () => number = () => 0) => {
    const written: string[] = [];
    const records: RawRecord[] = [];
    const next = step(prev, { log: line => written.push(line), records: rows => records.push(...rows), now });
    return { state: written.length ? { ...next, messages: mergeLog(prev.messages, next.messages, written) } : next, records };
};
