import { useMemo } from 'react';
import { SHA256 } from 'crypto-js';
import { bulkUpdateWinnings, type WinningsRecord } from '../utils/winningsService';
import type { Io, RawRecord } from '../utils/engine';

// The engine's Io inside a setGameState updater: log lines join that update, winnings go out after it commits.
export const useEngineIo = (log: (line: string) => void, afterCommit: (effect: () => void) => void, gameType: WinningsRecord['gameType']): Io =>
    useMemo(() => ({
        log,
        now: Date.now,
        records: (rows: RawRecord[]) => {
            if (rows.length === 0) return;
            const timestamp = new Date().toISOString();
            const records = rows.map(r => ({ phoneHash: SHA256(r.phone).toString(), playerName: r.name, gameType, winnings: r.winnings, timestamp }));
            afterCommit(() => bulkUpdateWinnings(records));
        },
    }), [log, afterCommit, gameType]);
