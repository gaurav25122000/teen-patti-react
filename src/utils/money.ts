// Splits amount into count shares that sum to it exactly; leftover rupees go one each to the first shares.
export const splitEvenly = (amount: number, count: number): number[] => {
    const base = Math.floor(amount / count);
    let leftover = amount - base * count;
    const shares = Array.from({ length: count }, () => {
        const extra = leftover >= 1 ? 1 : 0;
        leftover -= extra;
        return base + extra;
    });
    shares[0] += leftover; // fractional part, if any
    return shares;
};

// Whole paise, halves away from zero (as Dart's round), so +x and -x always round alike.
export const paise = (amount: number) => Math.sign(amount) * Math.round(Math.abs(amount) * 100) || 0; // never -0

// Money is kept in whole paise so every settlement can be paid exactly.
export const toPaise = (amount: number) => paise(amount) / 100;
