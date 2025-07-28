import React, { useState, useMemo } from 'react';
import { getWinnings } from '../utils/winningsService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './LifetimeWinnings.css'; // Import the updated CSS
import { toTitleCase } from '../utils/formatters';

const LifetimeWinnings: React.FC = () => {
    const [phoneNumbers, setPhoneNumbers] = useState('');
    const [winningsData, setWinningsData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetchWinnings = async () => {
        const numbers = phoneNumbers.split(',').map(n => n.trim()).filter(n => /^\d{10}$/.test(n));
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

    const COLORS = ['#00ffff', '#ff00ff', '#39ff14', '#ffd700', '#e8e8e8'];

    const processedTableData = useMemo(() => {
        if (!winningsData) return null;

        const summary: { [key: string]: { teenPatti: number, poker: number, playerName: string } } = {};

        winningsData.teenPatti.players.forEach((p: any) => {
            if (!summary[p.phoneHash]) {
                summary[p.phoneHash] = { teenPatti: 0, poker: 0, playerName: p.playerName };
            }
            summary[p.phoneHash].teenPatti = p.total;
        });

        winningsData.poker.players.forEach((p: any) => {
            if (!summary[p.phoneHash]) {
                summary[p.phoneHash] = { teenPatti: 0, poker: 0, playerName: p.playerName };
            }
            summary[p.phoneHash].poker = p.total;
        });

        const allRecords = winningsData.allRecords.sort((a: any, b: any) => {
            const nameA = a.player_name.toUpperCase();
            const nameB = b.player_name.toUpperCase();
            if (nameA < nameB) {
                return -1;
            }
            if (nameA > nameB) {
                return 1;
            }
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
                if (nameA < nameB) {
                    return -1;
                }
                if (nameA > nameB) {
                    return 1;
                }
                return 0;
            });


        return { summary, allRecords, summaryArray };

    }, [winningsData]);

    return (
        <div className="setup-screen">
            <h2>Lifetime Winnings</h2>
            <div className="form-group" style={{ alignItems: 'center', gap: '1rem' }}>
                <label>Enter Phone Numbers (comma-separated):</label>
                <input
                    type="text"
                    value={phoneNumbers}
                    onChange={(e) => setPhoneNumbers(e.target.value)}
                    placeholder="e.g., 1234567890, 0987654321"
                    style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}
                />
                <button className="btn btn-primary" onClick={handleFetchWinnings} disabled={loading}>
                    {loading ? 'Loading...' : 'Get Winnings'}
                </button>
            </div>
            {error && <p style={{ color: 'var(--color-glow-magenta)', textAlign: 'center' }}>{error}</p>}

            {winningsData && processedTableData && (
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
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedTableData.summaryArray.map((playerSummary) => {
                                        const overallTotal = playerSummary.teenPatti + playerSummary.poker;
                                        const totalClass = overallTotal >= 0 ? 'total-winnings' : 'total-losses';
                                        return (
                                            <tr key={playerSummary.hash}>
                                                <td>{toTitleCase(playerSummary.playerName)}</td>
                                                <td className={playerSummary.teenPatti >= 0 ? 'win-amount' : 'loss-amount'}>₹{playerSummary.teenPatti.toFixed(2)}</td>
                                                <td className={playerSummary.poker >= 0 ? 'win-amount' : 'loss-amount'}>₹{playerSummary.poker.toFixed(2)}</td>
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
                            <LineChart data={winningsData.teenPatti.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-muted)" />
                                <XAxis dataKey="date" stroke="var(--color-text)" />
                                <YAxis stroke="var(--color-text)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-glow-cyan)', color: 'var(--color-text)' }} labelStyle={{ color: 'var(--color-glow-cyan)' }} />
                                <Legend wrapperStyle={{ color: 'var(--color-text)' }} />
                                {winningsData.teenPatti.players.map((p: any, i: number) => (
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={toTitleCase(p.playerName)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>

                        <div className="stage-display" style={{ marginTop: '3rem', marginBottom: '2rem' }}>
                            <h2>Poker Winnings Trend</h2>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={winningsData.poker.trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-text-muted)" />
                                <XAxis dataKey="date" stroke="var(--color-text)" />
                                <YAxis stroke="var(--color-text)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-glow-gold)', color: 'var(--color-text)' }} labelStyle={{ color: 'var(--color-glow-gold)' }} />
                                <Legend wrapperStyle={{ color: 'var(--color-text)' }} />
                                {winningsData.poker.players.map((p: any, i: number) => (
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