// netlify/functions/utils/hash.ts
import bcrypt from 'bcryptjs';

const saltRounds = 10;

export const hashPhoneNumber = async (phoneNumber: string) => {
  return await bcrypt.hash(phoneNumber, saltRounds);
};
