// A phone taking over hosting opens the game with ?host=1. Read once at load (main.tsx imports this
// first), drop it from the URL, and honour it only briefly so a later game setup doesn't auto-stream.
const params = new URLSearchParams(window.location.search);
let arrivedAt = params.has('host') ? Date.now() : 0;
if (arrivedAt) {
    params.delete('host');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : ''));
}

const isFresh = () => arrivedAt > 0 && Date.now() - arrivedAt < 10_000;

export const isHandoverArrival = isFresh;

export const consumeHandoverArrival = () => {
    const fresh = isFresh();
    arrivedAt = 0;
    return fresh;
};
