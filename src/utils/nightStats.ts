import { formatAmount, toTitleCase } from './formatters.ts';
import { HOUSE_KEY, partyKey, partyLabels, type Person } from './owingsLogic.ts';

export type GameKind = 'teen-patti' | 'poker' | 'blackjack';

export interface PlayerNet {
    name: string;
    net: number;
}

// Kept in each game's state across rounds; reset when a new game starts. Keyed by party key.
export interface NightStats {
    rounds: number;
    wins: Record<string, number>;
    streaks: Record<string, number>;
    bestStreak: { key: string; count: number } | null;
    biggest: { key: string; amount: number } | null;
    names: Record<string, string>; // latest title-cased name per key
    partial?: boolean; // the game was saved before stats existed, so earlier rounds are missing
}

export const emptyStats = (): NightStats => ({ rounds: 0, wins: {}, streaks: {}, bestStreak: null, biggest: null, names: {} });

// For a save without stats.
export const partialStats = (): NightStats => ({ ...emptyStats(), partial: true });

// Latest title-cased name per party key, for recordRound.
export const statsNames = (players: { name: string; phoneNumber?: string }[]) =>
    Object.fromEntries(players.map(p => [partyKey(p.name, p.phoneNumber), toTitleCase(p.name)]));

// nets: party key -> round net for the players dealt in; anyone else keeps their streak.
export const recordRound = (
    stats: NightStats,
    nets: Record<string, number>,
    candidate: { key: string; amount: number } | null,
    names: Record<string, string>
): NightStats => {
    const wins = { ...stats.wins };
    const streaks = { ...stats.streaks };
    let bestStreak = stats.bestStreak;
    for (const [key, net] of Object.entries(nets)) {
        if (net > 0.005) {
            wins[key] = (wins[key] ?? 0) + 1;
            streaks[key] = (streaks[key] ?? 0) + 1;
            if (!bestStreak || streaks[key] > bestStreak.count) bestStreak = { key, count: streaks[key] };
        } else {
            streaks[key] = 0;
        }
    }
    const biggest = candidate && (!stats.biggest || candidate.amount > stats.biggest.amount) ? candidate : stats.biggest;
    return { ...stats, rounds: stats.rounds + 1, wins, streaks, bestStreak, biggest, names: { ...stats.names, ...names } };
};

// people: the settlement's people (the house is ignored for winner and loser). Labels come from
// partyLabels over the people first, then stats names for anyone no longer at the table.
export const summaryLines = (stats: NightStats, people: Person[], game: GameKind, carried = false, offBy = 0): string[] => {
    const labels = partyLabels([
        ...people.map(p => ({ key: p.key, name: p.title, phone: p.phone })),
        ...Object.entries(stats.names ?? {}).map(([key, name]) => ({ key, name, phone: key.startsWith('name:') ? null : key })),
    ]);
    const lines: string[] = [];
    if (stats.partial) lines.push("Stats start from the app update; earlier rounds aren't counted.");
    if (stats.biggest) {
        lines.push(`${game === 'blackjack' ? 'Biggest win' : 'Biggest pot'}: ₹${formatAmount(stats.biggest.amount)} (${labels[stats.biggest.key]})`);
    }
    const mostWins = Math.max(0, ...Object.values(stats.wins));
    if (mostWins >= 1) {
        const names = Object.keys(stats.wins).filter(key => stats.wins[key] === mostWins).map(key => labels[key]).sort();
        lines.push(`Most rounds won: ${names.join(', ')} (${mostWins})`);
    }
    if (stats.bestStreak && stats.bestStreak.count >= 2) {
        lines.push(`Best streak: ${labels[stats.bestStreak.key]} (${stats.bestStreak.count} in a row)`);
    }
    let winner: Person | null = null;
    let loser: Person | null = null;
    for (const p of people.filter(p => p.key !== HOUSE_KEY)) {
        if (p.net > 0.005 && (!winner || p.net > winner.net)) winner = p;
        if (p.net < -0.005 && (!loser || p.net < loser.net)) loser = p;
    }
    if (winner) lines.push(`Biggest winner: ${labels[winner.key]} +₹${formatAmount(winner.net)}`);
    if (loser) lines.push(`Biggest loser: ${labels[loser.key]} -₹${formatAmount(-loser.net)}`);
    if (carried) lines.push('Includes balances carried in at setup.');
    if (Math.abs(offBy) >= 0.005) lines.push(`Balances are off by ${offBy > 0 ? '+' : '-'}₹${formatAmount(Math.abs(offBy))}: settle the difference by hand.`);
    return lines;
};

// Blackjack's biggest-win candidate: the largest positive round net (first on a tie).
export const biggestWin = (nets: Record<string, number>) => {
    let best: { key: string; amount: number } | null = null;
    for (const [key, amount] of Object.entries(nets)) {
        if (amount > (best?.amount ?? 0)) best = { key, amount };
    }
    return best;
};
