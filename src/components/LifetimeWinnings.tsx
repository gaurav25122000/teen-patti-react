import React, { useState, useMemo } from 'react';
import { getWinnings } from '../utils/winningsService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './LifetimeWinnings.css'; // Import the updated CSS
import { toTitleCase } from '../utils/formatters';
import { readSavedPlayers } from '../utils/savedPlayers';
import { gameTotals, inRange, type RangeKind, type WinningsRecord } from '../utils/winningsRange';

const RANGES: [RangeKind, string][] = [['all', 'All time'], ['month', 'This month'], ['30d', 'Last 30 days'], ['year', 'This year'], ['custom', 'Custom']];

const LifetimeWinnings: React.FC = () => {
    const [phoneNumbers, setPhoneNumbers] = useState('');
    const [winningsData, setWinningsData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [range, setRange] = useState<RangeKind>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const handleFetchWinnings = async (text: string) => {
        const numbers = text.split(',').map(n => n.trim()).filter(n => /^\d{10}$/.test(n));
        if (numbers.length === 0) {
            setError("Please enter at least one valid 10-digit phone number.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const data = await getWinnings(numbers);
            setWinningsData(data);
        } catch (err) {
            setError("Failed to fetch winnings data.");
        } finally {
            setLoading(false);
        }
    };

    const checkSavedPlayers = () => {
        const phones = readSavedPlayers().map(p => p.phone).join(', ');
        if (!phones) return setError('No saved players yet.');
        setPhoneNumbers(phones);
        handleFetchWinnings(phones);
    };

    const COLORS = ['#00ffff', '#ff00ff', '#39ff14', '#ffd700', '#e8e8e8', '#ff6600'];

    // The fetched records within the chosen range, totalled the way getWinnings does.
    const view = useMemo(() => {
        if (!winningsData) return null;
        const servers: ReturnType<typeof gameTotals>[] = [winningsData.teenPatti, winningsData.poker, winningsData.blackjack];
        const hashes = servers[0].players.map(p => p.phoneHash);
        const names = Object.fromEntries(servers.flatMap(g => g.players).filter(p => p.playerName !== 'Unknown').map(p => [p.phoneHash, p.playerName]));
        const records = (winningsData.allRecords as WinningsRecord[]).filter(r => inRange(r.timestamp, range, new Date(), from, to));
        return {
            teenPatti: gameTotals(records, hashes, names, 'teen-patti'),
            poker: gameTotals(records, hashes, names, 'poker'),
            blackjack: gameTotals(records, hashes, names, 'blackjack'),
            allRecords: records,
        };
    }, [winningsData, range, from, to]);

    const processedTableData = useMemo(() => {
        if (!view) return null;

        const summary: { [key: string]: { teenPatti: number, poker: number, blackjack: number, playerName: string } } = {};

        const initializeSummary = (hash: string, name: string) => {
             if (!summary[hash]) {
                summary[hash] = { teenPatti: 0, poker: 0, blackjack: 0, playerName: name };
            }
        };

        view.teenPatti.players.forEach((p: any) => {
            initializeSummary(p.phoneHash, p.playerName);
            summary[p.phoneHash].teenPatti = p.total;
        });

        view.poker.players.forEach((p: any) => {
            initializeSummary(p.phoneHash, p.playerName);
            summary[p.phoneHash].poker = p.total;
        });

        // ADDED: Process blackjack data
        view.blackjack.players.forEach((p: any) => {
            initializeSummary(p.phoneHash, p.playerName);
            summary[p.phoneHash].blackjack = p.total;
        });

        const allRecords = [...view.allRecords].sort((a: any, b: any) => {
            const nameA = a.player_name.toUpperCase();
            const nameB = b.player_name.toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        const summaryArray = Object.keys(summary)
            .map(hash => ({
                hash,
                ...summary[hash]
            }))
            .sort((a, b) => {
                const nameA = a.playerName.toUpperCase();
                const nameB = b.playerName.toUpperCase();
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });


        return { summary, allRecords, summaryArray };

    }, [view]);

    return (
        <div className="setup-screen">
            <h2>Lifetime Winnings</h2>
            <div className="lookup-form">
                <label htmlFor="lifetime-phones">Phone numbers, comma-separated</label>
                <input
                    id="lifetime-phones"
                    type="text"
                    value={phoneNumbers}
                    onChange={(e) => setPhoneNumbers(e.target.value)}
                    placeholder="e.g., 1234567890, 0987654321"
                />
                <div className="setup-actions">
                    <button className="btn btn-primary" onClick={() => handleFetchWinnings(phoneNumbers)} disabled={loading}>
                        {loading ? 'Loading...' : 'Get Winnings'}
                    </button>
                    <button className="btn btn-violet" onClick={checkSavedPlayers} disabled={loading}>
                        Check saved players
                    </button>
                </div>
                {error && <p className="form-error">{error}</p>}
            </div>

            {winningsData && (
                <div className="game-actions" style={{ justifyContent: 'center' }}>
                    {RANGES.map(([kind, label]) => (
                        <button key={kind} className={range === kind ? 'btn-accent' : 'btn-secondary'} onClick={() => setRange(kind)}>{label}</button>
                    ))}
                    {range === 'custom' && (
                        <>
                            <input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
                            <input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
                        </>
                    )}
                </div>
            )}

            {view && processedTableData && (
                <div className="winnings-layout">
                    {/* Table Container is now at the top */}
                    <div className="table-container">
                        <div className="summary-table">
                            <h3>Player Summary</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Player</th>
                                        <th>Teen Patti</th>
                                        <th>Poker</th>
                                        <th>Blackjack</th> {/* ADDED */}
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedTableData.summaryArray.map((playerSummary) => {
                                        const overallTotal = playerSummary.teenPatti + playerSummary.poker + playerSummary.blackjack; // ADDED
                                        const totalClass = overallTotal >= 0 ? 'total-winnings' : 'total-losses';
                                        return (
                                            <tr key={playerSummary.hash}>
                                                <td>{toTitleCase(playerSummary.playerName)}</td>
                                                <td className={playerSummary.teenPatti >= 0 ? 'win-amount' : 'loss-amount'}>₹{playerSummary.teenPatti.toFixed(2)}</td>
                                                <td className={playerSummary.poker >= 0 ? 'win-amount' : 'loss-amount'}>₹{playerSummary.poker.toFixed(2)}</td>
                                                {/* ADDED */}
                                                <td className={playerSummary.blackjack >= 0 ? 'win-amount' : 'loss-amount'}>₹{playerSummary.blackjack.toFixed(2)}</td>
                                                <td className={totalClass}>₹{overallTotal.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* New Detailed Winnings Table */}
                    <div className="table-container">
                        <div className="summary-table">
                            <h3>Per Game Winnings</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Player</th>
                                        <th>Game</th>
                                        <th>Winnings</th>
                                        <th>Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedTableData.allRecords.map((record: any, index: number) => (
                                        <tr key={index}>
                                            <td>{toTitleCase(record.player_name)}</td>
                                            <td>{toTitleCase(record.game_type)}</td>
                                            <td className={record.winnings >= 0 ? 'win-amount' : 'loss-amount'}>
                                                ₹{parseFloat(record.winnings).toFixed(2)}
                                            </td>
                                            <td>{new Date(record.timestamp).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Graph Container is below the tables */}
                    <div className="graph-container">
                        <div className="stage-display" style={{ marginBottom: '2rem' }}>
                            <h2>Teen Patti Winnings Trend</h2>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={view.teenPatti.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-muted)" />
                                <XAxis dataKey="date" stroke="var(--color-text)" />
                                <YAxis stroke="var(--color-text)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-glow-cyan)', color: 'var(--color-text)' }} labelStyle={{ color: 'var(--color-glow-cyan)' }} />
                                <Legend wrapperStyle={{ color: 'var(--color-text)' }} />
                                {view.teenPatti.players.map((p: any, i: number) => (
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={toTitleCase(p.playerName)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>

                        <div className="stage-display" style={{ marginTop: '3rem', marginBottom: '2rem' }}>
                            <h2>Poker Winnings Trend</h2>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={view.poker.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-muted)" />
                                <XAxis dataKey="date" stroke="var(--color-text)" />
                                <YAxis stroke="var(--color-text)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-glow-gold)', color: 'var(--color-text)' }} labelStyle={{ color: 'var(--color-glow-gold)' }} />
                                <Legend wrapperStyle={{ color: 'var(--color-text)' }} />
                                {view.poker.players.map((p: any, i: number) => (
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={toTitleCase(p.playerName)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                        
                        {/* ADDED BLACKJACK CHART */}
                        <div className="stage-display" style={{ marginTop: '3rem', marginBottom: '2rem' }}>
                            <h2>Blackjack Winnings Trend</h2>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={view.blackjack.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-muted)" />
                                <XAxis dataKey="date" stroke="var(--color-text)" />
                                <YAxis stroke="var(--color-text)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-glow-magenta)', color: 'var(--color-text)' }} labelStyle={{ color: 'var(--color-glow-magenta)' }} />
                                <Legend wrapperStyle={{ color: 'var(--color-text)' }} />
                                {view.blackjack.players.map((p: any, i: number) => (
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={toTitleCase(p.playerName)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LifetimeWinnings;