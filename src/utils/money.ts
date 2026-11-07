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
