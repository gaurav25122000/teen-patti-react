import React, { useState } from 'react';
import { readSavedPlayers, saveEntry, writeSavedPlayers, type SavedPlayer } from '../utils/savedPlayers';
import { couldNot } from '../utils/formatters';

const BLANK = { name: '', phone: '', upi: '' };

const SavedPlayersScreen: React.FC = () => {
    const [list, setList] = useState(() => readSavedPlayers());
    const [form, setForm] = useState(BLANK);
    const [editingPhone, setEditingPhone] = useState<string | null>(null); // null = adding
    const [error, setError] = useState<string | null>(null);

    const persist = (next: SavedPlayer[], verb: 'save' | 'delete') => {
        try {
            writeSavedPlayers(next);
            setList(next);
            return true;
        } catch (err) {
            console.error('Could not save players:', err);
            setError(couldNot(verb, err));
            return false;
        }
    };

    const reset = () => {
        setForm(BLANK);
        setEditingPhone(null);
        setError(null);
    };

    const submit = () => {
        const result = saveEntry(list, form, editingPhone ?? undefined);
        if (typeof result === 'string') return setError(result);
        if (persist(result, 'save')) reset();
    };

    const startEdit = (p: SavedPlayer) => {
        setEditingPhone(p.phone);
        setForm({ name: p.name, phone: p.phone, upi: p.upi ?? '' });
        setError(null);
    };

    const remove = (p: SavedPlayer) => {
        if (!window.confirm(`Delete ${p.name}?`)) return;
        if (persist(list.filter(s => s.phone !== p.phone), 'delete') && editingPhone === p.phone) reset();
    };

    return (
        <div className="setup-screen">
            <h2>Saved Players</h2>
            <div className="saved-form">
                <input type="text" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input type="tel" placeholder="10-Digit Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <input type="text" placeholder="UPI ID (optional)" value={form.upi} onChange={e => setForm({ ...form, upi: e.target.value })} />
                <button className="btn btn-primary" onClick={submit}>{editingPhone ? 'Save' : 'Add'}</button>
                {editingPhone && <button className="btn btn-secondary" onClick={reset}>Cancel</button>}
            </div>
            {error && <p className="form-error">{error}</p>}
            {list.length === 0 ? (
                <p>No saved players yet. Players are saved when you set up a game.</p>
            ) : (
                <ul className="saved-list">
                    {list.map(p => (
                        <li key={p.phone}>
                            <span className="saved-name">{p.name}</span>
                            <span>{p.phone}</span>
                            <span>{p.upi ?? ''}</span>
                            <button className="btn-secondary" onClick={() => startEdit(p)}>Edit</button>
                            <button className="btn-danger" onClick={() => remove(p)}>Delete</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SavedPlayersScreen;
