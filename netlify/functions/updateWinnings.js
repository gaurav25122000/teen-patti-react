// netlify/functions/updateWinnings.js

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { phoneHash, gameType, winnings, timestamp } = JSON.parse(event.body);
        const { JSONSILO_API_KEY, JSONSILO_ID } = process.env;
        const JSONSILO_URL = `https://jsonsilo.com/api/v1/silo/${JSONSILO_ID}`;

        const getResponse = await fetch(JSONSILO_URL, { headers: { 'X-API-KEY': JSONSILO_API_KEY } });
        const record = getResponse.ok ? await getResponse.json() : {};

        if (!record[phoneHash]) {
            record[phoneHash] = { teenPatti: [], poker: [] };
        }
        if (!record[phoneHash][gameType]) {
            record[phoneHone][gameType] = [];
        }
        record[phoneHash][gameType].push({ amount: winnings, timestamp });

        await fetch(JSONSILO_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': JSONSILO_API_KEY
            },
            body: JSON.stringify(record)
        });

        return { statusCode: 200, body: JSON.stringify({ message: "Winnings updated." }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update winnings.' }) };
    }
};