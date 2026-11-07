const turnUrls = import.meta.env.VITE_TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean) ?? [];

// PeerJS's built-in TURN hosts no longer resolve; peers behind CGNAT need our own relay.
export const PEER_OPTIONS = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            ...(turnUrls.length > 0
                ? [{ urls: turnUrls, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
                : []),
        ],
    },
};
