// netlify/functions/updateWinnings.ts
import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const dataDir = path.resolve(process.cwd(), 'data');
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

const writeWinningsData = (data: any) => {
  ensureDataDirExists();
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
};

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { hashedPhoneNumber, winningsUpdate } = JSON.parse(event.body || '{}');

  if (!hashedPhoneNumber || !winningsUpdate) {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  const allWinnings = readWinningsData();

  if (!allWinnings[hashedPhoneNumber]) {
    allWinnings[hashedPhoneNumber] = {
      poker: { totalWinnings: 0, games: [] },
      teenPatti: { totalWinnings: 0, games: [] },
    };
  }

  const { gameType, winnings, date } = winningsUpdate;

  allWinnings[hashedPhoneNumber][gameType].totalWinnings += winnings;
  allWinnings[hashedPhoneNumber][gameType].games.push({ winnings, date });

  writeWinningsData(allWinnings);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};

export { handler };
