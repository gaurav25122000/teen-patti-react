const { VITE_TURN_URLS, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL } = import.meta.env;
const turnUrls = VITE_TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean) ?? [];

// PeerJS's built-in TURN hosts no longer resolve; peers behind CGNAT need our own relay.
// A TURN entry without credentials makes RTCPeerConnection throw, so all three are required.
export const PEER_OPTIONS = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            ...(turnUrls.length > 0 && VITE_TURN_USERNAME && VITE_TURN_CREDENTIAL
                ? [{ urls: turnUrls, username: VITE_TURN_USERNAME, credential: VITE_TURN_CREDENTIAL }]
                : []),
        ],
    },
};
