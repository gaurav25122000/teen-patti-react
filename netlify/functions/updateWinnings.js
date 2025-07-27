// netlify/functions/updateWinnings.js

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const newRecord = JSON.parse(event.body);
        const { JSONSILO_API_KEY, JSONSILO_ID } = process.env;
        console.log(JSONSILO_ID);
        console.log(JSONSILO_API_KEY);
        const JSONSILO_URL = `https://api.jsonsilo.com/api/v1/manage/${JSONSILO_ID}`;

        // Get the current array of records
        const getResponse = await fetch(JSONSILO_URL, { headers: { 'X-MAN-API': JSONSILO_API_KEY } });
        console.log(getResponse);
        const allRecords = getResponse.ok ? await getResponse.json() : [];
        console.log(allRecords);

        // Add the new record to the array
        allRecords.push(newRecord);

        // Write the updated array back
        await fetch(JSONSILO_URL, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-MAN-API': JSONSILO_API_KEY
            },
            body: JSON.stringify({
                "file_name": "bets-manager",
                "file_data": allRecords,
                "region_name": "api",
                "is_public": false
            })
        });

        return { statusCode: 200, body: JSON.stringify({ message: "Winnings updated." }) };

    } catch (error) {
        console.error("Error in updateWinnings function:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update winnings.' }) };
    }
};