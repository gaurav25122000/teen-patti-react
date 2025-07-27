// src/utils/lifetimeWinningsLogic.ts
import bcrypt from 'bcrypt';

const saltRounds = 10;

export const hashPhoneNumber = async (phoneNumber: string) => {
  return await bcrypt.hash(phoneNumber, saltRounds);
};

export const updateLifetimeWinnings = async (playerPhoneNumber: string, gameType: 'poker' | 'teenPatti', winnings: number) => {
  const hashedPhoneNumber = await hashPhoneNumber(playerPhoneNumber);

  const winningsUpdate = {
    gameType,
    winnings,
    date: new Date().toISOString(),
  };

  await fetch('/.netlify/functions/updateWinnings', {
    method: 'POST',
    body: JSON.stringify({
      hashedPhoneNumber,
      winningsUpdate,
    }),
  });
};
