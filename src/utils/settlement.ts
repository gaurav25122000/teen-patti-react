import { formatAmount } from './formatters.ts';
import type { SavedPlayer } from './savedPlayers.ts';
import type { Transaction } from './owingsLogic.ts';

// UPI is looked up by the payee's phone, never by name, so money can't go to a namesake.
export const upiFor = (phone: string | null | undefined, saved: SavedPlayer[]): string | undefined =>
    phone ? saved.find(s => s.phone === phone)?.upi : undefined;

export const upiLink = (upi: string, payee: string, amount: number) =>
    `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(payee)}&am=${encodeURIComponent(amount.toFixed(2))}`
    + `&cu=INR&tn=${encodeURIComponent('Bets Manager')}`;

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// Text for Copy and WhatsApp, from the live settlement or a history entry.
export const shareText = (transactions: Transaction[], summary: string[], saved: SavedPlayer[]): string => {
    const lines = ['Bets Manager settlement'];
    if (transactions.length === 0) lines.push('All settled up');
    for (const t of transactions) {
        const upi = upiFor(t.toPhone, saved);
        lines.push(`${t.from} pays ${t.to} ₹${formatAmount(t.amount)}${upi ? ` (UPI: ${upi})` : ''}`);
    }
    if (summary.length > 0) lines.push('', 'Night summary', ...summary);
    return lines.join('\n');
};
