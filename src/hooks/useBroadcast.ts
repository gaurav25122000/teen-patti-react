import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { sanitizeState } from '../utils/serialization';
import { PEER_OPTIONS } from '../utils/peerOptions';
import { parseViewerMessage, type HostMessage } from '../utils/streamProtocol';

export interface Viewer {
    id: string;
    name: string | null;
}

export type Handover =
    | { status: 'idle' }
    | { status: 'waiting' | 'declined'; name: string };

const sendToAll = (connections: DataConnection[], message: HostMessage) => {
    connections.forEach(conn => {
        if (conn.open) conn.send(message);
    });
};

// onHandedOver runs once the stream has stopped after a viewer accepted the game.
export const useBroadcast = (onHandedOver: (name: string) => void) => {
    const [streamId, setStreamId] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [viewers, setViewers] = useState<Viewer[]>([]);
    const [handover, setHandover] = useState<Handover>({ status: 'idle' });
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    const latestStateRef = useRef<Record<string, unknown> | null>(null);
    const handoverTargetRef = useRef<{ id: string; name: string } | null>(null);
    const onHandedOverRef = useRef(onHandedOver);
    onHandedOverRef.current = onHandedOver;

    const stopStreaming = useCallback(() => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        connectionsRef.current = [];
        latestStateRef.current = null;
        handoverTargetRef.current = null;
        setStreamId(null);
        setIsStreaming(false);
        setViewers([]);
    }, []);

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
            setViewers(prev => [...prev, { id: conn.connectionId, name: null }]);

            // A viewer joining mid-game needs the current state, not just the next change.
            conn.on('open', () => {
                if (latestStateRef.current) conn.send({ type: 'state', state: latestStateRef.current } satisfies HostMessage);
            });

            conn.on('data', (data) => {
                const message = parseViewerMessage(data);
                if (message?.type === 'viewer-name') {
                    setViewers(prev => (prev.some(v => v.id === conn.connectionId && v.name !== message.name)
                        ? prev.map(v => (v.id === conn.connectionId ? { ...v, name: message.name } : v))
                        : prev));
                } else if (message?.type === 'handover-reply' && handoverTargetRef.current?.id === conn.connectionId) {
                    const { name } = handoverTargetRef.current;
                    handoverTargetRef.current = null;
                    if (!message.accepted) {
                        setHandover({ status: 'declined', name });
                        return;
                    }
                    conn.send({ type: 'handover-confirmed' } satisfies HostMessage);
                    sendToAll(connectionsRef.current, { type: 'host-moved', to: name });
                    setHandover({ status: 'idle' });
                    setTimeout(() => { // let the messages reach viewers first
                        stopStreaming();
                        onHandedOverRef.current(name);
                    }, 800);
                }
            });

            conn.on('close', () => {
                connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
                setViewers(prev => prev.filter(v => v.id !== conn.connectionId));
            });
        });

        peerRef.current = peer;
    }, [stopStreaming]);

    // Function to broadcast state to all connected peers
    const broadcast = useCallback((state: object) => {
        if (!peerRef.current) return;

        const sanitizedData = sanitizeState(state);
        latestStateRef.current = sanitizedData;
        sendToAll(connectionsRef.current, { type: 'state', state: sanitizedData });
    }, []);

    const handOver = useCallback((viewer: Viewer, name: string) => {
        const conn = connectionsRef.current.find(c => c.connectionId === viewer.id);
        if (!conn?.open || !latestStateRef.current) return;
        handoverTargetRef.current = { id: viewer.id, name };
        conn.send({ type: 'handover', state: latestStateRef.current } satisfies HostMessage);
        setHandover({ status: 'waiting', name });
    }, []);

    const resetHandover = useCallback(() => {
        handoverTargetRef.current = null;
        setHandover({ status: 'idle' });
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
        viewers,
        viewerCount: viewers.length,
        handover,
        startStreaming,
        stopStreaming,
        broadcast,
        handOver,
        resetHandover,
    };
};
