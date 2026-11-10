// Raised after saved players or History change on this device, so sync can follow. Silent outside a browser.
export const LOCAL_CHANGE = 'bets-local-change';

export const notifyLocalChange = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_CHANGE));
};
