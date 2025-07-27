// netlify/functions/updateWinnings.js

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 250;

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { JSONSILO_API_KEY, JSONSILO_ID } = process.env;
    const MANAGE_URL = `https://api.jsonsilo.com/api/v1/manage/${JSONSILO_ID}`; // Unified URL

    const newRecord = JSON.parse(event.body);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Step 1: GET the current data using the manage endpoint
            const getResponse = await fetch(MANAGE_URL, {
                headers: { 'X-MAN-API': JSONSILO_API_KEY }
            });

            const siloData = getResponse.ok ? await getResponse.json() : {};
            const allRecords = siloData.file_data || [];
            const initialCount = allRecords.length;

            // Step 2: Add the new record in memory
            allRecords.push(newRecord);

            // Step 3: Use PATCH to update the silo's data
            const patchResponse = await fetch(MANAGE_URL, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-MAN-API': JSONSILO_API_KEY
                },
                body: JSON.stringify({
                    "file_name": "bets-manager",
                    "file_data": [
                        record
                    ],
                    "region_name": "api",
                    "is_public": false
                })
            });

            if (!patchResponse.ok) {
                throw new Error(`PATCH request to JsonSilo failed with status: ${patchResponse.status}`);
            }

            // Step 4: VERIFY the write after a short delay
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

            const verifyResponse = await fetch(MANAGE_URL, {
                headers: { 'X-MAN-API': JSONSILO_API_KEY }
            });
            const finalSiloData = verifyResponse.ok ? await verifyResponse.json() : {};
            const finalRecords = finalSiloData.file_data || [];

            // Step 5: Check if our write was successful
            if (finalRecords.length >= initialCount + 1) {
                return { statusCode: 200, body: JSON.stringify({ message: "Winnings updated successfully." }) };
            } else {
                console.warn(`Race condition detected on attempt ${attempt}. Retrying...`);
            }

        } catch (error) {
            console.error(`Error on attempt ${attempt}:`, error.message);
        }

        // Wait before the next retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS + Math.random() * 250));
    }

    console.error('Failed to update winnings after all retries.');
    return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to update winnings due to high server contention.' })
    };
};