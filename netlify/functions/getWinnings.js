// netlify/functions/getWinnings.js

import { neon } from '@netlify/neon';

// This function processes the array of raw transactions for charting
const processDataForChart = (allRecords, requestedHashes, gameType) => {
    // 1. Filter records for the relevant game type and players, then sort by date
    const relevantRecords = allRecords
        .filter(rec => rec.game_type === gameType && requestedHashes.includes(rec.phone_hash))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const trend = [];
    const cumulativeTotals = {}; // e.g., { phoneHash1: 100, phoneHash2: -50 }

    // Initialize totals for all requested players
    requestedHashes.forEach(hash => {
        cumulativeTotals[hash] = 0;
    });

    // 2. Create a trend point for each transaction
    relevantRecords.forEach(rec => {
        cumulativeTotals[rec.phone_hash] += parseFloat(rec.winnings);

        const trendPoint = {
            date: new Date(rec.timestamp).toLocaleDateString()
        };

        // Add the current cumulative total for each player at this point in time
        for (const hash in cumulativeTotals) {
            trendPoint[hash] = cumulativeTotals[hash];
        }

        trend.push(trendPoint);
    });

    // 3. Get the final total winnings for each player
    const players = requestedHashes
        .map(hash => ({
            phoneHash: hash,
            total: cumulativeTotals[hash] || 0
        }));

    return { trend, players };
};

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { phoneHashes } = await req.json();
        const sql = neon();

        const allRecords = await sql`
            SELECT phone_hash, game_type, winnings, timestamp FROM winnings
            WHERE phone_hash IN (${phoneHashes.map(item => `'${item}'`).join(',')})
        `;
        const teenPattiData = processDataForChart(allRecords, phoneHashes, 'teen-patti');
        const pokerData = processDataForChart(allRecords, phoneHashes, 'poker');

        return new Response(JSON.stringify({ teenPatti: teenPattiData, poker: pokerData }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Error in getWinnings function:", error);
        return new Response(JSON.stringify({ error: 'Failed to get winnings.' }), { status: 500 });
    }
};