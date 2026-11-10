// src/utils/formatters.ts

export const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str.trim().toLowerCase().split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

export const couldNot = (verb: 'save' | 'delete', error: unknown) =>
  `Couldn't ${verb}: ${error instanceof Error ? error.message : String(error)}`;

// Up to 2 decimals, trailing zeros trimmed, no separators (same as the Android app).
export const formatAmount = (amount: number): string =>
  Math.abs(amount) < 0.005 ? '0' : amount.toFixed(2).replace(/\.?0+$/, '');

// "+₹50", "-₹20", or "₹0" under half a paisa.
export const signedAmount = (net: number) => (Math.abs(net) < 0.005 ? '₹0' : `${net > 0 ? '+' : '-'}₹${formatAmount(Math.abs(net))}`);
