// netlify/functions/updateWinnings.ts
import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

const dataFilePath = path.resolve(process.cwd(), 'data', 'winnings.json');

const readWinningsData = () => {
  if (fs.existsSync(dataFilePath)) {
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(fileContent);
  }
  return {};
};

const writeWinningsData = (data: any) => {
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
