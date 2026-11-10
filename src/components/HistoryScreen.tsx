import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteHistoryEntry, hasUnreadableHistory, historyShareText, liveHistory, readHistory, setPaid, writeHistory, type HistoryEntry } from '../utils/history';
import { GAME_LABELS } from '../utils/nightStats';
import { couldNot, formatAmount, signedAmount } from '../utils/formatters';
import { readSavedPlayers } from '../utils/savedPlayers';
import { isUnbalanced, upiFor } from '../utils/settlement';
import ShareButtons from './ShareButtons';
import PayLink from './PayLink';
import Avatar from './Avatar';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

// readHistory may keep an unreadable value aside, so the notice is checked after it.
const loadHistory = () => {
    try {
        const entries = readHistory();
        return { entries, notice: hasUnreadableHistory() ? "Older history couldn't be read; it was kept aside." : null };
    } catch (err) {
        console.error('Could not read game history:', err);
        return { entries: [] as HistoryEntry[], notice: "History couldn't be read." };
    }
};

const HistoryScreen: React.FC = () => {
    const [{ entries, notice }, setHistory] = useState(loadHistory);
    const [openId, setOpenId] = useState<string | null>(null);
    const [saved] = useState(() => readSavedPlayers());
    const [error, setError] = useState<string | null>(null);
    const [payNote, setPayNote] = useState<string | null>(null);

    const persist = (next: HistoryEntry[], verb: 'save' | 'delete') => {
        try {
            writeHistory(next);
            setHistory(h => ({ ...h, entries: next }));
            setError(null);
            return true;
        } catch (err) {
            console.error('Could not save game history:', err);
            setError(couldNot(verb, err));
            return false;
        }
    };

    const open = liveHistory(entries).find(e => e.id === openId);
    if (open) {
        const remove = () => {
            if (window.confirm('Delete this game from history?') && persist(deleteHistoryEntry(entries, open.id), 'delete')) setOpenId(null);
        };
        return (
            <div className="setup-screen">
                <button className="btn-orange" onClick={() => { setOpenId(null); setPayNote(null); }}>← History</button>
                <h2>{GAME_LABELS[open.game]}</h2>
                <p>{when(open.endedAt)}</p>
                <ul className="owings-list">
                    {open.nets.map((n, i) => (
                        <li key={i}><span className="from"><Avatar name={n.name} /> {n.name}</span><span className="amount">{signedAmount(n.net)}</span></li>
                    ))}
                </ul>
                <h4>Settlement</h4>
                {open.transactions.length === 0 ? <p>{isUnbalanced(open.summary) ? 'No transfers between players.' : 'All settled up'}</p> : (
                    <ul className="history-transactions">
                        {open.transactions.map((t, i) => {
                            const upi = t.paid ? undefined : upiFor(t.toPhone, saved);
                            return (
                                <li key={i}>
                                    <label>
                                        <input type="checkbox" checked={t.paid} onChange={e => persist(setPaid(entries, open.id, i, e.target.checked), 'save')} />
                                        {' '}{t.from} → {t.to} ₹{formatAmount(t.amount)}
                                    </label>
                                    {upi && <PayLink upi={upi} payee={t.to} amount={t.amount} onNoApp={setPayNote} />}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {payNote && <p className="share-note">{payNote}</p>}
                {open.summary.length > 0 && (
                    <>
                        <h4>Night summary</h4>
                        <ul className="summary-list">{open.summary.map(line => <li key={line}>{line}</li>)}</ul>
                    </>
                )}
                {(open.transactions.length > 0 || open.summary.length > 0) && <ShareButtons text={historyShareText(open, saved)} subtitle={`${GAME_LABELS[open.game]} · ${day(open.endedAt)}`} />}
                {error && <p className="form-error">{error}</p>}
                <button className="btn btn-danger" onClick={remove}>Delete</button>
            </div>
        );
    }

    return (
        <div className="setup-screen">
            <h2>History</h2>
            <Link to="/stats" className="btn-sky">Player stats</Link>
            {notice && <p className="form-error">{notice}</p>}
            {liveHistory(entries).length === 0 ? <p>No finished games yet. A game is kept here when you end it.</p> : (
                <ul className="history-list">
                    {liveHistory(entries).map(e => (
                        <li key={e.id}>
                            <button className="btn-secondary" onClick={() => setOpenId(e.id)}>
                                {when(e.endedAt)} · {GAME_LABELS[e.game]} · {e.nets.length} players
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default HistoryScreen;
