import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { rehydrateState } from '../utils/serialization';
import { PEER_OPTIONS } from '../utils/peerOptions';
import { parseHostMessage, type ViewerMessage } from '../utils/streamProtocol';

export const useSpectate = (streamId: string | undefined) => {
    const [gameState, setGameState] = useState<any | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [handoverOffer, setHandoverOffer] = useState<Record<string, unknown> | null>(null);
    const [hostMovedTo, setHostMovedTo] = useState<string | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    useEffect(() => {
        if (!streamId) {
            setConnectionStatus('error');
            return;
        }

        const peer = new Peer(PEER_OPTIONS);

        peer.on('open', () => {
            // Reliable = ordered, so the initial state can't land after a newer broadcast.
            const conn = peer.connect(streamId, { reliable: true });

            conn.on('open', () => {
                setConnectionStatus('connected');
            });

            conn.on('data', (data) => {
                const message = parseHostMessage(data);
                if (message?.type === 'state') setGameState(rehydrateState(message.state));
                else if (message?.type === 'handover') setHandoverOffer(message.state);
                else if (message?.type === 'host-moved') setHostMovedTo(message.to);
            });

            conn.on('close', () => {
                setConnectionStatus('disconnected');
            });

            conn.on('error', (err) => {
                console.error('Connection error:', err);
                setConnectionStatus('error');
            });

            connRef.current = conn;
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            setConnectionStatus('error');
        });

        peerRef.current = peer;

        return () => {
            if (connRef.current) {
                connRef.current.close();
            }
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, [streamId]);

    const send = useCallback((message: ViewerMessage) => {
        if (connRef.current?.open) connRef.current.send(message);
    }, []);

    return {
        gameState,
        connectionStatus,
        handoverOffer,
        clearHandoverOffer: useCallback(() => setHandoverOffer(null), []),
        hostMovedTo,
        send,
    };
};
