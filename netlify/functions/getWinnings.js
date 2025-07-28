import { neon } from '@netlify/neon';

// This function processes the array of raw transactions for charting
const processDataForChart = (allRecords, requestedHashes, gameType) => {
    // 1. Filter for relevant records and sort chronologically. This is crucial.
    const relevantRecords = allRecords
        .filter(rec => rec.game_type === gameType && requestedHashes.includes(rec.phone_hash))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 2. Aggregate all winnings by date to handle multiple transactions in a single day.
    const dailyAggregations = {}; // e.g., { '2025-07-28': { hash1: 150, hash2: -50 } }
    relevantRecords.forEach(rec => {
        const date = new Date(rec.timestamp).toISOString().split('T')[0];
        if (!dailyAggregations[date]) {
            dailyAggregations[date] = {};
        }
        // Sum up winnings for the same player on the same day
        const winnings = parseFloat(rec.winnings);
        dailyAggregations[date][rec.phone_hash] = (dailyAggregations[date][rec.phone_hash] || 0) + winnings;
    });

    const trend = [];
    const cumulativeTotals = {}; // e.g., { phoneHash1: 100, phoneHash2: -50 }
    requestedHashes.forEach(hash => {
        cumulativeTotals[hash] = 0;
    });

    // 3. Get sorted dates to process in chronological order
    const sortedDates = Object.keys(dailyAggregations).sort();

    // 4. Create a single, cumulative trend point for each date
    sortedDates.forEach(date => {
        const dailyChanges = dailyAggregations[date];

        // Update cumulative totals with the aggregated changes for this day
        for (const hash in dailyChanges) {
            cumulativeTotals[hash] += dailyChanges[hash];
        }

        // Create the trend point for this date with the new cumulative totals
        const trendPoint = { date };
        for (const hash in cumulativeTotals) {
            trendPoint[hash] = cumulativeTotals[hash];
        }

        trend.push(trendPoint);
    });

    // 5. Get the final total winnings for each player
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
            WHERE phone_hash = ANY(${phoneHashes})
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