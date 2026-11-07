import React, { useEffect, useState } from 'react';
import InteractionModal from './InteractionModal';
import { useBroadcast } from '../hooks/useBroadcast';

interface StreamControlsProps {
    gameState: object;
    gameType: 'teen-patti' | 'poker' | 'blackjack';
    style: React.CSSProperties;
}

const StreamControls: React.FC<StreamControlsProps> = ({ gameState, gameType, style }) => {
    const { startStreaming, stopStreaming, broadcast, isStreaming, streamId, viewerCount } = useBroadcast();
    const [showStreamModal, setShowStreamModal] = useState(false);

    // Broadcast state changes
    useEffect(() => {
        if (isStreaming) {
            broadcast({ ...gameState, gameType });
        }
    }, [gameState, gameType, isStreaming, broadcast]);

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
        </>
    );
};

export default StreamControls;
