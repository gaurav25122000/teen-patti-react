// netlify/functions/bulkUpdateWinnings.js

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { records: newRecords } = JSON.parse(event.body);

        if (!newRecords || !Array.isArray(newRecords) || newRecords.length === 0) {
            return { statusCode: 400, body: 'Bad Request: No records provided to update.' };
        }

        const { JSONSILO_API_KEY, JSONSILO_ID } = process.env;
        const MANAGE_URL = `https://api.jsonsilo.com/api/v1/manage/${JSONSILO_ID}`;

        // Get the current array of records from the silo
        const getResponse = await fetch(MANAGE_URL, {
            headers: { 'X-MAN-API': JSONSILO_API_KEY }
        });

        const existingRecords = getResponse.ok ? await getResponse.json() : {};

        // Combine the existing records with the new batch of records
        const combinedRecords = existingRecords.concat(newRecords);

        // Write the complete, updated array back to the silo in a single PATCH operation
        const patchResponse = await fetch(MANAGE_URL, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-MAN-API': JSONSILO_API_KEY
            },
            body: JSON.stringify({
                "file_name": "bets-manager",
                "file_data": combinedRecords,
                "region_name": "api",
                "is_public": false
            })
        });

        if (!patchResponse.ok) {
            throw new Error(`PATCH request to JsonSilo failed with status: ${patchResponse.status}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Bulk update successful." })
        };

    } catch (error) {
        console.error("Error in bulkUpdateWinnings function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to bulk update winnings.' })
        };
    }
};