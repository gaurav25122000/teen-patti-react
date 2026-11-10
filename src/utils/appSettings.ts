// Device-local app settings (dashboard → Settings), all on by default.
export interface AppSettings {
    sounds: boolean;
    haptics: boolean;
    keepAwake: boolean;
    confirmFold: boolean;
}

export const APP_SETTINGS_KEY = 'bets-app-settings';
const DEFAULTS: AppSettings = { sounds: true, haptics: true, keepAwake: true, confirmFold: true };

// Unreadable or missing values fall back to the defaults, one setting at a time.
export const readAppSettings = (storage: Pick<Storage, 'getItem'> = localStorage): AppSettings => {
    try {
        const saved = JSON.parse(storage.getItem(APP_SETTINGS_KEY) ?? '{}');
        return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, typeof saved?.[k] === 'boolean' ? saved[k] : v])) as unknown as AppSettings;
    } catch {
        return DEFAULTS;
    }
};

export const writeAppSettings = (settings: AppSettings, storage: Pick<Storage, 'setItem'> = localStorage) => {
    try {
        storage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
        return true;
    } catch (err) {
        console.error('Could not save app settings:', err);
        return false;
    }
};
