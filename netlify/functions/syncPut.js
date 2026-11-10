// netlify/functions/syncPut.js
import { neon } from '@netlify/neon';

const GROUP_ID = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const FIELDS = ['groupId', 'kind', 'blob', 'baseVersion'];
const KINDS = ['players', 'history'];
const MAX_BLOB = 2_000_000;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Why a body is refused (400), or null.
const problem = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'The body must be a JSON object.';
    const unknown = Object.keys(body).find(key => !FIELDS.includes(key));
    if (unknown) return `Unknown field: ${unknown}.`;
    if (typeof body.groupId !== 'string' || !GROUP_ID.test(body.groupId)) return 'groupId must be 64 lowercase hex characters.';
    if (!KINDS.includes(body.kind)) return 'kind must be players or history.';
    if (!Number.isInteger(body.baseVersion) || body.baseVersion < 0) return 'baseVersion must be a whole number of at least 0.';
    if (typeof body.blob !== 'string' || body.blob === '' || body.blob.length % 4 !== 0 || !BASE64.test(body.blob)) return 'blob must be base64.';
    return null;
};

// Stores a group's encrypted blob if nobody wrote since baseVersion; otherwise 409 with the newer blob to merge.
export const makeSyncPut = (getSql) => async (req) => {
    if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
    let body;
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'The body must be JSON.' });
    }
    if (typeof body?.blob === 'string' && body.blob.length > MAX_BLOB) return json(413, { error: 'The blob is too large.' });
    const refused = problem(body);
    if (refused) return json(400, { error: refused });

    const { groupId, kind, blob, baseVersion } = body;
    try {
        const sql = getSql();
        const stored = baseVersion === 0
            ? await sql`INSERT INTO sync_blobs (group_id, kind, blob, version) VALUES (${groupId}, ${kind}, ${blob}, 1)
                        ON CONFLICT (group_id, kind) DO NOTHING RETURNING version`
            : await sql`UPDATE sync_blobs SET blob = ${blob}, version = version + 1, updated_at = now()
                        WHERE group_id = ${groupId} AND kind = ${kind} AND version = ${baseVersion} RETURNING version`;
        if (stored.length > 0) return json(200, { version: stored[0].version });
        const current = await sql`SELECT blob, version FROM sync_blobs WHERE group_id = ${groupId} AND kind = ${kind}`;
        return json(409, current.length > 0 ? { blob: current[0].blob, version: current[0].version } : { blob: null, version: 0 });
    } catch (error) {
        if (error?.code === '42P01') return json(503, { error: "Sync isn't set up on the server yet." });
        console.error('syncPut failed:', error);
        return json(500, { error: 'Sync failed on the server.' });
    }
};

export default makeSyncPut(() => neon());
