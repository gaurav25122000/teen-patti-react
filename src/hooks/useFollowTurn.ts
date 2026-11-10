import { useEffect } from 'react';

// When the turn moves, scrolls the element whose turn it is into view only if it is off screen, and only as far as needed.
export const useFollowTurn = (selector: string | null) => {
    useEffect(() => {
        const el = selector ? document.querySelector<HTMLElement>(selector) : null;
        if (!el) return;
        el.style.scrollMarginBottom = `${document.querySelector<HTMLElement>('.action-panel')?.offsetHeight ?? 0}px`; // the docked panel hides the foot of the screen
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selector]);
};
