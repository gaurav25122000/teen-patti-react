// netlify/functions/getWinnings.ts
import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

const dataDir = '/tmp/data';
const dataFilePath = path.resolve(dataDir, 'winnings.json');

const ensureDataDirExists = () => {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
};

const readWinningsData = () => {
  ensureDataDirExists();
  if (fs.existsSync(dataFilePath)) {
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    try {
      return JSON.parse(fileContent);
    } catch {
      return {}; // Return empty object if file is corrupt
    }
  }
  return {};
};

import { hashPhoneNumber } from '../../src/utils/lifetimeWinningsLogic';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { phoneNumbers } = JSON.parse(event.body || '{}');

  if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  const allWinnings = readWinningsData();
  const winningsData = await Promise.all(phoneNumbers.map(async (phoneNumber) => {
    const hashedPhoneNumber = await hashPhoneNumber(phoneNumber);
    const encodedHashedPhoneNumber = btoa(hashedPhoneNumber);
    return allWinnings[encodedHashedPhoneNumber] || { poker: { totalWinnings: 0, games: [] }, teenPatti: { totalWinnings: 0, games: [] }, phoneNumber };
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(winningsData),
  };
};

export { handler };
