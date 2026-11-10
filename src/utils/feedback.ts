// Sounds (public/sounds, same names as Android) and vibration, each behind its app setting.
import { readAppSettings } from './appSettings';

export type Sound = 'chip' | 'raise' | 'fold' | 'see' | 'show' | 'deal' | 'new_round' | 'card' | 'tap' | 'win'
    | 'error' | 'level_up' | 'tick' | 'alarm' | 'undo' | 'settle' | 'share';

const SOUNDS: Sound[] = ['chip', 'raise', 'fold', 'see', 'show', 'deal', 'new_round', 'card', 'tap', 'win',
    'error', 'level_up', 'tick', 'alarm', 'undo', 'settle', 'share'];
const QUIET: Partial<Record<Sound, number>> = { tap: 0.35, tick: 0.6 }; // the rest play at full volume

let context: AudioContext | null = null;
const buffers = new Map<Sound, AudioBuffer>();

// Decodes every sound once. Web Audio starts them at once and lets them overlap; an <audio> element lags and cuts off.
const audio = () => {
    if (context || typeof AudioContext === 'undefined') return context;
    const ctx = new AudioContext();
    context = ctx;
    SOUNDS.forEach(sound => {
        fetch(`/sounds/${sound}.wav`)
            .then(response => response.arrayBuffer())
            .then(data => ctx.decodeAudioData(data))
            .then(buffer => buffers.set(sound, buffer))
            .catch(() => { /* offline before the first load, or a missing file: that sound stays silent */ });
    });
    return ctx;
};

// Decoding works before the first touch, so the first action is not silent. Browsers only start audio after
// a touch, and phones suspend it in the background: every touch resumes it.
if (typeof window !== 'undefined') {
    if (readAppSettings().sounds) audio();
    window.addEventListener('pointerdown', () => {
        if (readAppSettings().sounds) void audio()?.resume();
    }, { capture: true, passive: true });
}

const playSound = (sound: Sound) => {
    if (!readAppSettings().sounds) return;
    const ctx = audio();
    const buffer = buffers.get(sound);
    if (!ctx || !buffer) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = QUIET[sound] ?? 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
};

const vibrate = (pattern: number | number[]) => {
    if (readAppSettings().haptics) navigator.vibrate?.(pattern);
};

let pendingTap: ReturnType<typeof setTimeout> | undefined;

// A sound with its haptic: error and alarm buzz heavy, tick none, everything else a light tap.
// A tap waits 40 ms: when the press also logs an action, only the action's sound plays.
export const cue = (sound: Sound) => {
    clearTimeout(pendingTap);
    if (sound === 'tap') {
        pendingTap = setTimeout(() => { playSound('tap'); vibrate(15); }, 40);
        return;
    }
    playSound(sound);
    if (sound === 'error' || sound === 'alarm') vibrate([40, 60, 40]);
    else if (sound !== 'tick') vibrate(15);
};
