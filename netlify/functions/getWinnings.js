// netlify/functions/getWinnings.js

// This function processes the array of raw transactions for charting
const processDataForChart = (allRecords, requestedHashes, gameType) => {
    // 1. Filter records for the relevant game type and players, then sort by date
    const relevantRecords = allRecords
        .filter(rec => rec.gameType === gameType && requestedHashes.includes(rec.phoneHash))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const trend = [];
    const cumulativeTotals = {}; // e.g., { phoneHash1: 100, phoneHash2: -50 }

    // Initialize totals for all requested players
    requestedHashes.forEach(hash => {
        cumulativeTotals[hash] = 0;
    });

    // 2. Create a trend point for each transaction
    relevantRecords.forEach(rec => {
        cumulativeTotals[rec.phoneHash] += rec.winnings;
        
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

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { phoneHashes } = JSON.parse(event.body);
        const { JSONSILO_API_KEY, JSONSILO_ID } = process.env;
        const JSONSILO_URL = `https://api.jsonsilo.com/api/v1/manage/${JSONSILO_ID}`;

        const response = await fetch(JSONSILO_URL, { headers: { 'X-MAN-API': JSONSILO_API_KEY } });
        console.log(response);
        const allRecords = response.ok ? await response.json() : [];
        console.log(allRecords);
        
        const teenPattiData = processDataForChart(allRecords, phoneHashes, 'teen-patti');
        const pokerData = processDataForChart(allRecords, phoneHashes, 'poker');

        return {
            statusCode: 200,
            body: JSON.stringify({ teenPatti: teenPattiData, poker: pokerData })
        };

    } catch (error) {
         console.error("Error in getWinnings function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get winnings.' }) };
    }
};