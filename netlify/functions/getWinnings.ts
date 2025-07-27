// netlify/functions/getWinnings.ts
import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

const dataFilePath = path.resolve(process.cwd(), 'data', 'winnings.json');

const readWinningsData = () => {
  if (fs.existsSync(dataFilePath)) {
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(fileContent);
  }
  return {};
};

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { phoneNumbers } = JSON.parse(event.body || '{}');

  if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  const allWinnings = readWinningsData();
  const winningsData = phoneNumbers.map(phoneNumber => {
    return allWinnings[phoneNumber] || { poker: { totalWinnings: 0, games: [] }, teenPatti: { totalWinnings: 0, games: [] } };
  });

  return {
    statusCode: 200,
    body: JSON.stringify(winningsData),
  };
};

export { handler };
