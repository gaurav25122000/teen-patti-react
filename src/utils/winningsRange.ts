// Lifetime Winnings by date range, worked out on the phone from the records getWinnings returns.
export type RangeKind = 'all' | 'month' | '30d' | 'year' | 'custom';

export interface WinningsRecord {
    phone_hash: string;
    player_name: string;
    game_type: string;
    winnings: number | string;
    timestamp: string;
}

// Local time: this month and this year by calendar; the last 30 days are today and the 29 before;
// custom runs from the start of `from` to the end of `to` (YYYY-MM-DD), both inclusive.
export const inRange = (timestamp: string, kind: RangeKind, now: Date, from = '', to = '') => {
    const t = new Date(timestamp);
    if (kind === 'month') return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
    if (kind === 'year') return t.getFullYear() === now.getFullYear();
    if (kind === '30d') return t >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29) && t <= now;
    if (kind === 'custom') {
        const start = from ? new Date(`${from}T00:00:00`) : null;
        const end = to ? new Date(`${to}T23:59:59.999`) : null;
        return (!start || t >= start) && (!end || t <= end);
    }
    return true;
};

// One game's totals and cumulative daily trend, as getWinnings builds them (days by UTC date).
export const gameTotals = (records: WinningsRecord[], hashes: string[], names: Record<string, string>, gameType: string) => {
    const daily: Record<string, Record<string, number>> = {};
    records
        .filter(r => r.game_type === gameType && hashes.includes(r.phone_hash))
        .forEach(r => {
            const date = new Date(r.timestamp).toISOString().split('T')[0];
            daily[date] = daily[date] ?? {};
            daily[date][r.phone_hash] = (daily[date][r.phone_hash] ?? 0) + Number(r.winnings);
        });
    const totals: Record<string, number> = Object.fromEntries(hashes.map(h => [h, 0]));
    const trend = Object.keys(daily).sort().map(date => {
        for (const hash in daily[date]) totals[hash] += daily[date][hash];
        return { date, ...totals };
    });
    return { trend, players: hashes.map(hash => ({ phoneHash: hash, playerName: names[hash] ?? 'Unknown', total: totals[hash] })) };
};
