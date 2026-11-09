// Group sync crypto: the server only ever sees groupId and ciphertext. Same bytes as the Android app.
const utf8 = (text: string) => new TextEncoder().encode(text);
const concat = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
};
const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export const newGroupKey = () => crypto.getRandomValues(new Uint8Array(32));

export const joinCode = (key: Uint8Array) => `BM1-${toBase64(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

// The 32-byte key in a join code (or a join link), or null when it isn't one.
export const keyFromCode = (input: string): Uint8Array | null => {
    const code = input.trim().replace(/^.*#join=/, '');
    const match = /^BM1-([A-Za-z0-9_-]{43})$/.exec(code);
    if (!match) return null;
    try {
        const key = fromBase64(match[1].replace(/-/g, '+').replace(/_/g, '/') + '=');
        return key.length === 32 ? key : null;
    } catch {
        return null;
    }
};

export const groupIdOf = async (key: Uint8Array) => hex(await sha256(concat(utf8('bets-manager-group-id'), key)));

const aesKey = async (key: Uint8Array) =>
    crypto.subtle.importKey('raw', await sha256(concat(utf8('bets-manager-enc-key'), key)), 'AES-GCM', false, ['encrypt', 'decrypt']);

// base64(nonce 12 ‖ ciphertext ‖ tag 16) of the UTF-8 text. The nonce is random unless a test fixes it.
export const encryptBlob = async (key: Uint8Array, plaintext: string, nonce = crypto.getRandomValues(new Uint8Array(12))) => {
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await aesKey(key), utf8(plaintext)));
    return toBase64(concat(nonce, sealed));
};

// Throws when the blob was made with another key or is damaged.
export const decryptBlob = async (key: Uint8Array, blob: string) => {
    const bytes = fromBase64(blob);
    if (bytes.length < 28) throw new Error('blob too short');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(key), bytes.slice(12));
    return new TextDecoder().decode(plain);
};
