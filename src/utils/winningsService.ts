// src/utils/winningsService.ts
import { SHA256 } from 'crypto-js';

// The base URL for your Netlify functions, which proxies requests securely.
const FUNCTIONS_URL = '/.netlify/functions';

// Hashes the phone number on the client-side before sending it.
const hashPhoneNumber = (phoneNumber: string): string => {
    return SHA256(phoneNumber).toString();
};

export const updateWinnings = async (phoneNumber: string, gameType: 'teen-patti' | 'poker', amount: number): Promise<void> => {
    const hashedPhone = hashPhoneNumber(phoneNumber);
    try {
        await fetch(`${FUNCTIONS_URL}/updateWinnings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneHash: hashedPhone,
                gameType,
                winnings: amount,
                timestamp: new Date().toISOString(),
            }),
        });
    } catch (error) {
        console.error("Failed to update winnings via Netlify Function:", error);
    }
};

export const getWinnings = async (phoneNumbers: string[]): Promise<any | null> => {
    const hashedPhones = phoneNumbers.map(hashPhoneNumber);
    try {
        const response = await fetch(`${FUNCTIONS_URL}/getWinnings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneHashes: hashedPhones }),
        });
        if (!response.ok) {
            throw new Error('Server responded with an error while fetching winnings.');
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to get winnings via Netlify Function:", error);
        return null;
    }
};