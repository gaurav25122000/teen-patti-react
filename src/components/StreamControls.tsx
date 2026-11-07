import React, { useEffect, useState } from 'react';
import InteractionModal from './InteractionModal';
import { useBroadcast } from '../hooks/useBroadcast';
import { toTitleCase } from '../utils/formatters';
import { consumeHandoverArrival } from '../utils/hostHandover';

interface StreamControlsProps {
    gameState: object;
    gameType: 'teen-patti' | 'poker' | 'blackjack';
    style: React.CSSProperties;
    onHandedOver: () => void; // removes this phone's copy once a viewer has taken the game
}

const StreamControls: React.FC<StreamControlsProps> = ({ gameState, gameType, style, onHandedOver }) => {
    const { startStreaming, stopStreaming, broadcast, isStreaming, streamId, viewers, viewerCount, handover, handOver, resetHandover } = useBroadcast(name => {
        alert(`Hosting moved to ${name}'s phone. They'll share a new stream link. The game has been removed from this phone.`);
        onHandedOver();
    });
    const [showStreamModal, setShowStreamModal] = useState(false);
    const [showHandoverModal, setShowHandoverModal] = useState(false);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const streamLink = streamId ? `${window.location.origin}/watch/${streamId}` : null;

    // Broadcast state changes
    useEffect(() => {
        if (isStreaming) {
            broadcast({ ...gameState, gameType });
        }
    }, [gameState, gameType, isStreaming, broadcast]);

    // A phone that just took over hosting starts a fresh stream.
    useEffect(() => {
        if (!consumeHandoverArrival()) return;
        startStreaming();
        setShowStreamModal(true);
    }, [startStreaming]);

    useEffect(() => {
        if (!streamLink) {
            setQrCode(null);
            return;
        }
        let cancelled = false;
        import('qrcode')
            .then(QRCode => QRCode.toDataURL(streamLink, { margin: 1, width: 360 }))
            .then(url => { if (!cancelled) setQrCode(url); })
            .catch(err => console.error('QR code failed:', err));
        return () => { cancelled = true; };
    }, [streamLink]);

    const handleStartStream = () => {
        startStreaming();
        setShowStreamModal(true);
    };

    const handleStopStream = () => {
        stopStreaming();
        setShowStreamModal(false);
    };

    const copyStreamLink = () => {
        const link = `${window.location.origin}/watch/${streamId}`;
        navigator.clipboard.writeText(link);
        alert('Stream link copied to clipboard!');
    };

    const closeHandover = () => {
        setShowHandoverModal(false);
        resetHandover();
    };

    const handoverBody = () => {
        if (handover.status === 'waiting') return <p>Waiting for {handover.name} to accept...</p>;
        if (handover.status === 'declined') return <p>{handover.name} said no.</p>;
        if (viewers.length === 0) return <p>No one is watching right now.</p>;
        // Names are self-reported; number repeats so each phone can be told apart.
        const seen = new Map<string, number>();
        const labels = viewers.map((viewer, i) => {
            const base = viewer.name ? toTitleCase(viewer.name) : `Viewer ${i + 1}`;
            const count = (seen.get(base) ?? 0) + 1;
            seen.set(base, count);
            return count > 1 ? `${base} (${count})` : base;
        });
        return (
            <>
                <p>Pick the phone that will run the game from now on. The game moves there and is removed from this phone. Names are what each viewer picked.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {viewers.map((viewer, i) => (
                        <button key={viewer.id} className="btn-secondary" onClick={() => handOver(viewer, labels[i])}>{labels[i]}</button>
                    ))}
                </div>
            </>
        );
    };

    return (
        <>
            {!isStreaming && (
                <button className="btn-sm btn-outline-info" style={style} onClick={handleStartStream}>
                    Start Live Stream
                </button>
            )}

            {isStreaming && (
                <div style={{ ...style, display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="badge badge-success">LIVE ({viewerCount})</span>
                    <button className="btn-sm btn-outline-secondary" onClick={() => setShowStreamModal(true)}>Link</button>
                    {viewerCount > 0 && <button className="btn-sm btn-outline-secondary" onClick={() => setShowHandoverModal(true)}>Hand over</button>}
                    <button className="btn-sm btn-outline-danger" onClick={handleStopStream}>Stop</button>
                </div>
            )}

            {showStreamModal && !streamId && (
                <InteractionModal
                    isOpen={true}
                    onClose={() => setShowStreamModal(false)}
                    title="Starting Stream..."
                    theme="default"
                    footerContent={null}
                >
                    <div style={{ padding: '20px', textAlign: 'center' }}>Connecting to stream server...</div>
                </InteractionModal>
            )}

            {showStreamModal && streamId && (
                <InteractionModal
                    isOpen={true}
                    onClose={() => setShowStreamModal(false)}
                    title="Live Stream Started"
                    theme="success"
                    footerContent={<button className="btn-modal btn-modal-primary" onClick={() => setShowStreamModal(false)}>Close</button>}
                >
                    <div style={{ textAlign: 'center' }}>
                        <p>Share this link with friends to let them watch:</p>
                        {qrCode && <img src={qrCode} alt="QR code for the stream link" width={180} height={180} style={{ marginTop: '8px', borderRadius: '8px' }} />}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <input
                                type="text"
                                readOnly
                                value={`${window.location.origin}/watch/${streamId}`}
                                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', color: '#fff' }}
                            />
                            <button className="btn-secondary" onClick={copyStreamLink}>Copy</button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '12px' }}>
                            Keep this tab open. Stream ends if you leave.
                        </p>
                    </div>
                </InteractionModal>
            )}

            {showHandoverModal && (
                <InteractionModal
                    isOpen={true}
                    onClose={closeHandover}
                    title="Hand over the host"
                    theme="default"
                    footerContent={<button className="btn-modal btn-modal-secondary" onClick={closeHandover}>{handover.status === 'waiting' ? 'Cancel' : 'Close'}</button>}
                >
                    {handoverBody()}
                </InteractionModal>
            )}
        </>
    );
};

export default StreamControls;
