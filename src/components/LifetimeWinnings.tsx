// src/components/LifetimeWinnings.tsx
import React, { useState, useMemo } from 'react';
import { getWinnings } from '../utils/winningsService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './LifetimeWinnings.css'; // Import the updated CSS

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

        const summary: { [key: string]: { teenPatti: number, poker: number } } = {};

        winningsData.teenPatti.players.forEach((p: any) => {
            if (!summary[p.phoneHash]) summary[p.phoneHash] = { teenPatti: 0, poker: 0 };
            summary[p.phoneHash].teenPatti = p.total;
        });

        winningsData.poker.players.forEach((p: any) => {
            if (!summary[p.phoneHash]) summary[p.phoneHash] = { teenPatti: 0, poker: 0 };
            summary[p.phoneHash].poker = p.total;
        });

        return { summary };

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
                                    {Object.keys(processedTableData.summary).map((hash, i) => {
                                        const totals = processedTableData.summary[hash];
                                        const overallTotal = totals.teenPatti + totals.poker;
                                        const totalClass = overallTotal >= 0 ? 'total-winnings' : 'total-losses';
                                        return (
                                            <tr key={hash}>
                                                <td>Player {i + 1}</td>
                                                <td className={totals.teenPatti >= 0 ? 'win-amount' : 'loss-amount'}>₹{totals.teenPatti.toFixed(2)}</td>
                                                <td className={totals.poker >= 0 ? 'win-amount' : 'loss-amount'}>₹{totals.poker.toFixed(2)}</td>
                                                <td className={totalClass}>₹{overallTotal.toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Graph Container is below the table */}
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
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={`Player ${i + 1}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
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
                                    <Line key={p.phoneHash} type="monotone" dataKey={p.phoneHash} name={`Player ${i + 1}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
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