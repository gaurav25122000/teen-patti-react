import React, { useState } from 'react';
import { AVATAR_COLORS, avatarColor, deleteEntry, livePlayers, loadAllSavedPlayers, saveEntry, writeSavedPlayers, type SavedPlayer } from '../utils/savedPlayers';
import { couldNot } from '../utils/formatters';
import Avatar from './Avatar';
import { useFormError } from '../hooks/useFormError';

const BLANK = { name: '', phone: '', upi: '', color: undefined as number | undefined, emoji: '' };

const SavedPlayersScreen: React.FC = () => {
    const [loaded] = useState(() => loadAllSavedPlayers());
    const [all, setAll] = useState(loaded.list); // tombstones included, so sync can't bring deletes back
    const [form, setForm] = useState(BLANK);
    const [editingPhone, setEditingPhone] = useState<string | null>(null); // null = adding
    const [error, setError] = useFormError('', loaded.failed ? "Couldn't load saved players." : null);
    const list = livePlayers(all);

    const persist = (next: SavedPlayer[], verb: 'save' | 'delete') => {
        if (loaded.failed) {
            setError(couldNot(verb, new Error("saved players can't be read")));
            return false;
        }
        try {
            writeSavedPlayers(next);
            setAll(next);
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
        const result = saveEntry(all, form, editingPhone ?? undefined);
        if (typeof result === 'string') return setError(result);
        if (persist(result, 'save')) reset();
    };

    const startEdit = (p: SavedPlayer) => {
        setEditingPhone(p.phone);
        setForm({ name: p.name, phone: p.phone, upi: p.upi ?? '', color: p.color, emoji: p.emoji ?? '' });
        setError(null);
    };

    const remove = (p: SavedPlayer) => {
        if (!window.confirm(`Delete ${p.name}?`)) return;
        if (persist(deleteEntry(all, p.phone), 'delete') && editingPhone === p.phone) reset();
    };

    const shownColor = form.color ?? (form.phone.trim() ? avatarColor({ name: form.name, phone: form.phone.trim() }) : undefined);

    return (
        <div className="setup-screen">
            <h2>Saved Players</h2>
            <div className="saved-form">
                <input type="text" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input type="tel" inputMode="numeric" placeholder="10-Digit Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <input type="text" placeholder="UPI ID (optional)" value={form.upi} onChange={e => setForm({ ...form, upi: e.target.value })} />
                <input type="text" className="emoji-input" placeholder="Emoji" value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} aria-label="Emoji (optional)" />
                <div className="color-swatches" role="radiogroup" aria-label="Colour">
                    {AVATAR_COLORS.map((c, i) => (
                        <button key={c} type="button" role="radio" aria-checked={shownColor === i} className="color-swatch"
                            style={{ background: c }} onClick={() => setForm({ ...form, color: i })} />
                    ))}
                </div>
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
                            <Avatar name={p.name} phone={p.phone} saved={list} />
                            <span className="saved-name">{p.name}</span>
                            <span>{p.phone}</span>
                            <span>{p.upi ?? ''}</span>
                            <button className="btn-sky" onClick={() => startEdit(p)}>Edit</button>
                            <button className="btn-danger" onClick={() => remove(p)}>Delete</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SavedPlayersScreen;
