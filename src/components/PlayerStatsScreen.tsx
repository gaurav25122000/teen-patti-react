import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readHistory } from '../utils/history';
import { headToHead, playerStats } from '../utils/playerStats';
import { signedAmount } from '../utils/formatters';
import Avatar from './Avatar';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

// Player stats from this phone's History (synced entries included).
const PlayerStatsScreen: React.FC = () => {
    const [entries] = useState(() => {
        try {
            return readHistory();
        } catch (err) {
            console.error('Could not read game history:', err);
            return [];
        }
    });
    const stats = useMemo(() => playerStats(entries), [entries]);
    const [openName, setOpenName] = useState<string | null>(null);
    const [pair, setPair] = useState<[string, string]>(['', '']);
    const h2h = pair[0] && pair[1] && pair[0] !== pair[1] ? headToHead(entries, pair[0], pair[1]) : null;

    return (
        <div className="setup-screen">
            <h2>Player stats</h2>
            <Link to="/history" className="btn-orange">History</Link>
            {stats.length === 0 ? <p>No finished games yet.</p> : (
                <ul className="history-list">
                    {stats.map(s => (
                        <li key={s.name}>
                            <button className="btn-secondary" onClick={() => setOpenName(openName === s.name ? null : s.name)}>
                                <Avatar name={s.name} /> {s.name}
                            </button>
                            <div className="summary-list">
                                Games {s.games} · Won {s.won} · Total {signedAmount(s.total)} · Best {signedAmount(s.best)} · Worst {signedAmount(s.worst)} · Average {signedAmount(s.average)}
                            </div>
                            {openName === s.name && (
                                <ul className="summary-list">
                                    {s.trend.map((t, i) => <li key={i}>{day(t.endedAt)}: {signedAmount(t.total)}</li>)}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {stats.length > 1 && (
                <>
                    <h3>Head to head</h3>
                    {[0, 1].map(i => (
                        <select key={i} aria-label={`Player ${i + 1}`} value={pair[i]} onChange={e => setPair(p => (i === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
                            <option value="">Pick a player</option>
                            {stats.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                    ))}
                    {h2h && (
                        <p>
                            Games {h2h.games} · {pair[0]} {signedAmount(h2h.a)} · {pair[1]} {signedAmount(h2h.b)}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default PlayerStatsScreen;
