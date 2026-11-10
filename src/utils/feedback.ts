// Sounds (public/sounds, same names as Android) and vibration, each behind its app setting.
import { readAppSettings } from './appSettings';

export type Sound = 'chip' | 'raise' | 'fold' | 'see' | 'show' | 'deal' | 'new_round' | 'card' | 'tap' | 'win'
    | 'error' | 'level_up' | 'tick' | 'alarm' | 'undo' | 'settle' | 'share';

const players = new Map<Sound, HTMLAudioElement>();

const playSound = (sound: Sound) => {
    if (!readAppSettings().sounds || typeof Audio === 'undefined') return;
    const audio = players.get(sound) ?? new Audio(`/sounds/${sound}.wav`);
    players.set(sound, audio);
    audio.currentTime = 0;
    audio.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
};

const vibrate = (pattern: number | number[]) => {
    if (readAppSettings().haptics) navigator.vibrate?.(pattern);
};

// A sound with its haptic: error and alarm buzz heavy, tick none, everything else a light tap.
export const cue = (sound: Sound) => {
    playSound(sound);
    if (sound === 'error' || sound === 'alarm') vibrate([40, 60, 40]);
    else if (sound !== 'tick') vibrate(15);
};
