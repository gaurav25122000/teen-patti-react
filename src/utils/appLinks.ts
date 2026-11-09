// Call when following an app link: onFail runs if the page never lost focus, i.e. no app took the link.
export const watchForApp = (onFail: () => void) => {
    let left = false;
    const onLeave = () => { left = true; };
    window.addEventListener('blur', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    window.setTimeout(() => {
        window.removeEventListener('blur', onLeave);
        document.removeEventListener('visibilitychange', onLeave);
        if (!left) onFail();
    }, 1500);
};
