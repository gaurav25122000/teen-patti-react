// netlify/functions/getWinnings.js

const processDataForChart = (data, phoneHashes, gameType) => {
    const trend = [];
    const playersData = {};
    let allTimestamps = new Set();

    phoneHashes.forEach(hash => {
        if (data[hash] && data[hash][gameType]) {
            playersData[hash] = data[hash][gameType];
            playersData[hash].forEach(rec => allTimestamps.add(rec.timestamp));
        }
    });

    const sortedTimestamps = Array.from(allTimestamps).sort();

    sortedTimestamps.forEach(ts => {
        const trendPoint = { date: new Date(ts).toLocaleDateString() };
        phoneHashes.forEach(hash => {
            const cumulativeWinnings = (playersData[hash] || [])
                .filter(rec => new Date(rec.timestamp) <= new Date(ts))
                .reduce((sum, rec) => sum + rec.amount, 0);
            trendPoint[hash] = cumulativeWinnings;
        });
        trend.push(trendPoint);
    });

    const players = phoneHashes
        .filter(hash => data[hash])
        .map(hash => ({
            phoneHash: hash,
            total: (data[hash][gameType] || []).reduce((sum, rec) => sum + rec.amount, 0)
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
        const JSONSILO_URL = `https://jsonsilo.com/api/v1/silo/${JSONSILO_ID}`;

        const response = await fetch(JSONSILO_URL, {
            headers: { 'X-API-KEY': JSONSILO_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to fetch from JSONSilo.');

        const record = await response.json();

        const teenPattiData = processDataForChart(record, phoneHashes, 'teenPatti');
        const pokerData = processDataForChart(record, phoneHashes, 'poker');

        return {
            statusCode: 200,
            body: JSON.stringify({ teenPatti: teenPattiData, poker: pokerData })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get winnings.' }) };
    }
};