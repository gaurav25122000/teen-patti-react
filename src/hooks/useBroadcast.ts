import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { type DataConnection } from 'peerjs';

export const useBroadcast = (initialState: any) => {
    const [streamId, setStreamId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    
    // Move starting the stream to an explicit action to avoid creating peers unnecessarily
    const startStreaming = useCallback(() => {
        if (peerRef.current) return;

        const peer = new Peer();
        
        peer.on('open', (id) => {
            setStreamId(id);
            setIsStreaming(true);
        });

        peer.on('connection', (conn) => {
            connectionsRef.current.push(conn);
            setViewerCount(prev => prev + 1);

            // Send immediate state update upon connection
            // We need a way to access the *current* state here, which might change.
            // For now, we rely on the host to broadcast generally, but initial sync is important.
            // Ideally, we'd pass the current state ref or similar, but let's handle it by
            // triggering a broadcast from the component side when isStreaming becomes true
            // or letting the regular broadcast loop handle it.
            // A better way: when a connection opens, we can't easily grab the latest state 
            // from inside this callback unless we use a ref for state.
            
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
        setStreamId(null);
        setIsStreaming(false);
        setViewerCount(0);
    }, []);

    // Function to broadcast state to all connected peers
    const broadcast = useCallback((state: any) => {
        if (!peerRef.current || connectionsRef.current.length === 0) return;
        
        connectionsRef.current.forEach(conn => {
            if (conn.open) {
                conn.send(state);
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
