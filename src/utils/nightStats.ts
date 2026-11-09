import { formatAmount } from './formatters.ts';

export type GameKind = 'teen-patti' | 'poker' | 'blackjack';

export interface PlayerNet {
    name: string;
    net: number;
}

// Kept in each game's state across rounds; reset when a new game starts.
export interface NightStats {
    rounds: number;
    wins: Record<string, number>;
    streaks: Record<string, number>;
    bestStreak: { name: string; count: number } | null;
    biggest: { name: string; amount: number } | null;
}

export const emptyStats = (): NightStats => ({ rounds: 0, wins: {}, streaks: {}, bestStreak: null, biggest: null });

// nets: display name -> round net for the players dealt in; anyone else keeps their streak.
export const recordRound = (
    stats: NightStats,
    nets: Record<string, number>,
    candidate: { name: string; amount: number } | null
): NightStats => {
    const wins = { ...stats.wins };
    const streaks = { ...stats.streaks };
    let bestStreak = stats.bestStreak;
    for (const [name, net] of Object.entries(nets)) {
        if (net > 0.005) {
            wins[name] = (wins[name] ?? 0) + 1;
            streaks[name] = (streaks[name] ?? 0) + 1;
            if (!bestStreak || streaks[name] > bestStreak.count) bestStreak = { name, count: streaks[name] };
        } else {
            streaks[name] = 0;
        }
    }
    const biggest = candidate && (!stats.biggest || candidate.amount > stats.biggest.amount) ? candidate : stats.biggest;
    return { rounds: stats.rounds + 1, wins, streaks, bestStreak, biggest };
};

// playerNets are per player in player order (not per entity, no dealer).
export const summaryLines = (stats: NightStats, playerNets: PlayerNet[], game: GameKind): string[] => {
    const lines: string[] = [];
    if (stats.biggest) {
        lines.push(`${game === 'blackjack' ? 'Biggest win' : 'Biggest pot'}: ₹${formatAmount(stats.biggest.amount)} (${stats.biggest.name})`);
    }
    const mostWins = Math.max(0, ...Object.values(stats.wins));
    if (mostWins >= 1) {
        const names = Object.keys(stats.wins).filter(name => stats.wins[name] === mostWins).sort();
        lines.push(`Most rounds won: ${names.join(', ')} (${mostWins})`);
    }
    if (stats.bestStreak && stats.bestStreak.count >= 2) {
        lines.push(`Best streak: ${stats.bestStreak.name} (${stats.bestStreak.count} in a row)`);
    }
    let winner: PlayerNet | null = null;
    let loser: PlayerNet | null = null;
    for (const p of playerNets) {
        if (p.net > 0.005 && (!winner || p.net > winner.net)) winner = p;
        if (p.net < -0.005 && (!loser || p.net < loser.net)) loser = p;
    }
    if (winner) lines.push(`Biggest winner: ${winner.name} +₹${formatAmount(winner.net)}`);
    if (loser) lines.push(`Biggest loser: ${loser.name} -₹${formatAmount(-loser.net)}`);
    return lines;
};

// Blackjack's biggest-win candidate: the largest positive round net (first on a tie).
export const biggestWin = (nets: Record<string, number>) => {
    let best: { name: string; amount: number } | null = null;
    for (const [name, amount] of Object.entries(nets)) {
        if (amount > (best?.amount ?? 0)) best = { name, amount };
    }
    return best;
};
