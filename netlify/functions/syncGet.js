// netlify/functions/syncGet.js
import { neon } from '@netlify/neon';

const GROUP_ID = /^[0-9a-f]{64}$/;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Returns a group's two encrypted blobs. The server never sees a key or any plaintext.
export const makeSyncGet = (getSql) => async (req) => {
    if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
    let body;
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'The body must be JSON.' });
    }
    const valid = body && typeof body === 'object' && !Array.isArray(body)
        && Object.keys(body).every(key => key === 'groupId') && typeof body.groupId === 'string' && GROUP_ID.test(body.groupId);
    if (!valid) return json(400, { error: 'groupId must be 64 lowercase hex characters.' });

    try {
        const sql = getSql();
        const rows = await sql`SELECT kind, blob, version FROM sync_blobs WHERE group_id = ${body.groupId}`;
        const of = (kind) => {
            const row = rows.find(r => r.kind === kind);
            return row ? { blob: row.blob, version: row.version } : null;
        };
        return json(200, { players: of('players'), history: of('history') });
    } catch (error) {
        if (error?.code === '42P01') return json(503, { error: "Sync isn't set up on the server yet." });
        console.error('syncGet failed:', error);
        return json(500, { error: 'Sync failed on the server.' });
    }
};

export default makeSyncGet(() => neon());
