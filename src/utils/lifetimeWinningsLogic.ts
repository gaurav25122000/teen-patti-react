// src/utils/lifetimeWinningsLogic.ts

export const updateLifetimeWinnings = async (playerPhoneNumber: string, gameType: 'poker' | 'teenPatti', winnings: number) => {


  const winningsUpdate = {
    gameType,
    winnings,
    date: new Date().toISOString(),
  };

  await fetch('/.netlify/functions/updateWinnings', {
    method: 'POST',
    body: JSON.stringify({
      hashedPhoneNumber: playerPhoneNumber,
      winningsUpdate,
    }),
  });
};
