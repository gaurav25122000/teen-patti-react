import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { sanitizeState } from '../utils/serialization';
import { PEER_OPTIONS } from '../utils/peerOptions';

export const useBroadcast = () => {
    const [streamId, setStreamId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    const latestStateRef = useRef<unknown>(null);

    // Move starting the stream to an explicit action to avoid creating peers unnecessarily
    const startStreaming = useCallback(() => {
        if (peerRef.current) return;

        const peer = new Peer(PEER_OPTIONS);
        
        peer.on('open', (id) => {
            setStreamId(id);
            setIsStreaming(true);
        });

        peer.on('connection', (conn) => {
            connectionsRef.current.push(conn);
            setViewerCount(prev => prev + 1);

            // A viewer joining mid-game needs the current state, not just the next change.
            conn.on('open', () => {
                if (latestStateRef.current) conn.send(latestStateRef.current);
            });

            conn.on('close', () => {
                connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
                setViewerCount(prev => prev - 1);
            });
        });

        peerRef.current = peer;
    }, []);

    const stopStreaming = useCallback(() => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        connectionsRef.current = [];
        latestStateRef.current = null;
        setStreamId(null);
        setIsStreaming(false);
        setViewerCount(0);
    }, []);

    // Function to broadcast state to all connected peers
    const broadcast = useCallback((state: any) => {
        if (!peerRef.current) return;

        const sanitizedData = sanitizeState(state);
        latestStateRef.current = sanitizedData;

        connectionsRef.current.forEach(conn => {
            if (conn.open) {
                conn.send(sanitizedData);
            }
        });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, []);

    return {
        streamId,
        isStreaming,
        viewerCount,
        startStreaming,
        stopStreaming,
        broadcast
    };
};
