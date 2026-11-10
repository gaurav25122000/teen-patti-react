import React, { useEffect, useState } from 'react';
import { currentStatus, groupCode, joinGroup, leaveGroup, onStatus, syncNow } from '../sync/syncRunner';
import { keyFromCode, newGroupKey } from '../sync/syncCrypto';
import { cue } from '../utils/feedback';
import { useFormError } from '../hooks/useFormError';

const JOIN_LINK = 'https://teen-patti-bets.netlify.app/#join=';

const SyncScreen: React.FC = () => {
    const [status, setStatus] = useState(currentStatus);
    const [code, setCode] = useState(groupCode);
    const [joinInput, setJoinInput] = useState(() => (window.location.hash.startsWith('#join=') ? window.location.hash.slice(6) : ''));
    const [showCode, setShowCode] = useState(false);
    const [qr, setQr] = useState<string | null>(null);
    const [error, setError] = useFormError();

    useEffect(() => onStatus(setStatus), []);
    useEffect(() => {
        if (!showCode || !code) return;
        import('qrcode').then(QRCode => QRCode.toDataURL(JOIN_LINK + code, { margin: 1, width: 280 })).then(setQr, () => setQr(null));
    }, [showCode, code]);

    const join = () => {
        const key = keyFromCode(joinInput);
        if (!key) return setError("That isn't a group code.");
        if (!window.confirm('Join this group? Your saved players and history will be shared with it.')) return;
        joinGroup(key);
        setCode(groupCode());
        setJoinInput('');
        setError(null);
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    };

    // Only a tapped sync sounds, and only on a result; one already running stays silent.
    const syncTapped = () => void syncNow().then(() => {
        const result = currentStatus();
        if (result.startsWith('Synced')) cue('settle');
        else if (result.startsWith('Sync failed')) cue('error');
    });

    const create = () => {
        joinGroup(newGroupKey());
        setCode(groupCode());
    };

    const leave = () => {
        if (!window.confirm('Leave this group? Your saved players and history stay on this phone.')) return;
        leaveGroup();
        setCode(null);
        setShowCode(false);
    };

    return (
        <div className="setup-screen">
            <h2>Sync</h2>
            <p className="sync-status">{status}</p>
            {code ? (
                <div className="setup-actions">
                    <button className="btn btn-primary" onClick={syncTapped}>SYNC NOW</button>
                    <button className="btn btn-secondary" onClick={() => setShowCode(s => !s)}>SHOW CODE/QR</button>
                    <button className="btn btn-danger" onClick={leave}>LEAVE GROUP</button>
                </div>
            ) : (
                <>
                    <div className="setup-actions">
                        <button className="btn btn-primary" onClick={create}>CREATE GROUP</button>
                    </div>
                    <div className="lookup-form">
                        <label htmlFor="sync-join">Join a group</label>
                        <input id="sync-join" type="text" placeholder="Paste a group code or link" value={joinInput} onChange={e => setJoinInput(e.target.value)} />
                        <div className="setup-actions">
                            <button className="btn btn-success" onClick={join}>JOIN</button>
                        </div>
                    </div>
                </>
            )}
            {error && <p className="form-error">{error}</p>}
            {showCode && code && (
                <div className="sync-code">
                    <code>{code}</code>
                    {qr && <img src={qr} alt="Group QR code" />}
                </div>
            )}
        </div>
    );
};

export default SyncScreen;
