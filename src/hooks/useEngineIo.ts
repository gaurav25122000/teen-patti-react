import { useMemo } from 'react';
import { SHA256 } from 'crypto-js';
import { bulkUpdateWinnings, type WinningsRecord } from '../utils/winningsService';
import type { Io, RawRecord } from '../utils/engine';
import { toPaise } from '../utils/money';

// Hashes each phone and sends the rows to Lifetime Winnings.
export const sendWinnings = (rows: RawRecord[], gameType: WinningsRecord['gameType']) => {
    if (rows.length === 0) return;
    const timestamp = new Date().toISOString();
    return bulkUpdateWinnings(rows.map(r => ({ phoneHash: SHA256(r.phone).toString(), playerName: r.name, gameType, winnings: toPaise(r.winnings), timestamp })));
};

// The engine's Io inside a setGameState updater: log lines join that update, winnings go out after it commits.
export const useEngineIo = (log: (line: string) => void, afterCommit: (effect: () => void) => void, gameType: WinningsRecord['gameType']): Io =>
    useMemo(() => ({
        log,
        now: Date.now,
        records: (rows: RawRecord[]) => {
            if (rows.length > 0) afterCommit(() => sendWinnings(rows, gameType));
        },
    }), [log, afterCommit, gameType]);
