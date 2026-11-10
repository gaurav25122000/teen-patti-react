// src/utils/formatters.ts
import { paise } from './money.ts';

export const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str.trim().toLowerCase().split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

export const couldNot = (verb: 'save' | 'delete', error: unknown) =>
  `Couldn't ${verb}: ${error instanceof Error ? error.message : String(error)}`;

// Whole rupees as "120", paise always as two digits: "120.50", "-12.05" (same as the Android app).
export const formatAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e15) return amount.toFixed(2); // beyond whole-paise range
  const p = paise(amount);
  const abs = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.floor(abs / 100)}${abs % 100 ? `.${String(abs % 100).padStart(2, '0')}` : ''}`;
};

// "-₹20", never "₹-20".
export const money = (amount: number) => (amount <= -0.005 ? `-₹${formatAmount(-amount)}` : `₹${formatAmount(amount)}`);

// "+₹50", "-₹20", or "₹0" under half a paisa.
export const signedAmount = (net: number) => (Math.abs(net) < 0.005 ? '₹0' : `${net > 0 ? '+' : '-'}₹${formatAmount(Math.abs(net))}`);
