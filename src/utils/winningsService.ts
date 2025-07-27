// src/utils/winningsService.ts
import { SHA256 } from 'crypto-js';

const FUNCTIONS_URL = '/.netlify/functions';

// Hashes the phone number on the client-side
const hashPhoneNumber = (phoneNumber: string): string => {
    return SHA256(phoneNumber).toString();
};

// Defines the structure for a single transaction record
export interface WinningsRecord {
    phoneHash: string;
    gameType: 'teen-patti' | 'poker';
    winnings: number;
    timestamp: string;
}

// Sends a batch of winnings records to the serverless function
export const bulkUpdateWinnings = async (records: WinningsRecord[]): Promise<void> => {
    if (records.length === 0) {
        return; // Don't make an API call if there's nothing to update
    }
    try {
        await fetch(`${FUNCTIONS_URL}/bulkUpdateWinnings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records }), // Send the array inside a 'records' property
        });
    } catch (error) {
        console.error("Failed to bulk update winnings via Netlify Function:", error);
    }
};

// The getWinnings function remains unchanged
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