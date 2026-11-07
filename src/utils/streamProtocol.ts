// Messages on a stream's data channel. Anyone with the link can connect, so both sides validate.
export type HostMessage =
    | { type: 'state'; state: Record<string, unknown> }
    | { type: 'handover'; state: Record<string, unknown> }
    | { type: 'host-moved'; to: string };

export type ViewerMessage =
    | { type: 'viewer-name'; name: string | null }
    | { type: 'handover-reply'; accepted: boolean };

export const MAX_NAME_LENGTH = 40;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseViewerMessage = (data: unknown): ViewerMessage | null => {
    if (!isRecord(data)) return null;
    if (data.type === 'viewer-name' && (data.name === null || (typeof data.name === 'string' && data.name.length <= MAX_NAME_LENGTH))) {
        return { type: 'viewer-name', name: data.name };
    }
    if (data.type === 'handover-reply' && typeof data.accepted === 'boolean') {
        return { type: 'handover-reply', accepted: data.accepted };
    }
    return null;
};

export const parseHostMessage = (data: unknown): HostMessage | null => {
    if (!isRecord(data)) return null;
    if ((data.type === 'state' || data.type === 'handover') && isRecord(data.state)) {
        return { type: data.type, state: data.state };
    }
    if (data.type === 'host-moved' && typeof data.to === 'string') {
        return { type: 'host-moved', to: data.to.slice(0, MAX_NAME_LENGTH) };
    }
    // A host still on the previous build sends the raw state.
    if (!('type' in data) && Array.isArray(data.players)) return { type: 'state', state: data };
    return null;
};
