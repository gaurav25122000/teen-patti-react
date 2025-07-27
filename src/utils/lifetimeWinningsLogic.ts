// src/utils/lifetimeWinningsLogic.ts
import bcrypt from 'bcryptjs';

export const updateLifetimeWinnings = async (playerPhoneNumber: string, gameType: 'poker' | 'teenPatti', winnings: number) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPhoneNumber = await bcrypt.hash(playerPhoneNumber, salt);
  const encodedHashedPhoneNumber = btoa(hashedPhoneNumber);


  const winningsUpdate = {
    gameType,
    winnings,
    date: new Date().toISOString(),
  };

  await fetch('/.netlify/functions/updateWinnings', {
    method: 'POST',
    body: JSON.stringify({
      hashedPhoneNumber: encodedHashedPhoneNumber,
      winningsUpdate,
    }),
  });
};
