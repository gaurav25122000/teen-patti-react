import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';

export const useSpectate = (streamId: string | undefined) => {
    const [gameState, setGameState] = useState<any | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    useEffect(() => {
        if (!streamId) {
            setConnectionStatus('error');
            return;
        }

        const peer = new Peer();

        peer.on('open', (id) => {
            const conn = peer.connect(streamId);

            conn.on('open', () => {
                setConnectionStatus('connected');
            });

            conn.on('data', (data: any) => {
                setGameState(data);
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

    return {
        gameState,
        connectionStatus
    };
};
