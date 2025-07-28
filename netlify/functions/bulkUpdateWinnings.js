// netlify/functions/bulkUpdateWinnings.js

import { neon } from '@netlify/neon';

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { records: newRecords } = await req.json();

        if (!newRecords || !Array.isArray(newRecords) || newRecords.length === 0) {
            return new Response('Bad Request: No records provided to update.', { status: 400 });
        }

        const sql = neon();

        await sql.transaction(
            newRecords.map(record =>
                sql`
                    INSERT INTO winnings (phone_hash, player_name, game_type, winnings, "timestamp")
                    VALUES (${record.phoneHash}, ${record.playerName}, ${record.gameType}, ${record.winnings}, ${record.timestamp})
                `
            )
        );


        return new Response(JSON.stringify({ message: "Bulk update successful." }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Error in bulkUpdateWinnings function:", error);
        return new Response(JSON.stringify({ error: 'Failed to bulk update winnings.' }), {
            status: 500
        });
    }
};