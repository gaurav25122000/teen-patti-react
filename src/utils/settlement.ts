import { formatAmount, toTitleCase } from './formatters.ts';
import type { SavedPlayer } from './savedPlayers.ts';

// The payee's UPI ID when exactly one saved player with that title-cased name has one.
export const upiFor = (payee: string, saved: SavedPlayer[]): string | undefined => {
    const ids = saved.filter(s => s.upi && toTitleCase(s.name) === payee).map(s => s.upi!);
    return ids.length === 1 ? ids[0] : undefined;
};

export const upiLink = (upi: string, payee: string, amount: number) =>
    `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(payee)}&am=${encodeURIComponent(amount.toFixed(2))}`
    + `&cu=INR&tn=${encodeURIComponent('Bets Manager')}`;

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// Text for Copy and WhatsApp, from the live settlement or a history entry.
export const shareText = (
    transactions: { from: string; to: string; amount: number }[],
    summary: string[],
    saved: SavedPlayer[]
): string => {
    const lines = ['Bets Manager settlement'];
    if (transactions.length === 0) lines.push('All settled up');
    for (const t of transactions) {
        const upi = upiFor(t.to, saved);
        lines.push(`${t.from} pays ${t.to} ₹${formatAmount(t.amount)}${upi ? ` (UPI: ${upi})` : ''}`);
    }
    if (summary.length > 0) lines.push('', 'Night summary', ...summary);
    return lines.join('\n');
};
