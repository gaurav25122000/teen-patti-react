import React, { useState } from 'react';
import { readAppSettings, writeAppSettings, type AppSettings } from '../utils/appSettings';
import { useFormError } from '../hooks/useFormError';

const LABELS: [keyof AppSettings, string][] = [['sounds', 'Sounds'], ['haptics', 'Haptics'], ['keepAwake', 'Keep screen awake'], ['confirmFold', 'Confirm before fold']];

// This phone's own settings; they don't sync.
const AppSettingsScreen: React.FC = () => {
    const [settings, setSettings] = useState(readAppSettings);
    const [error, setError] = useFormError();
    const toggle = (key: keyof AppSettings) => {
        const next = { ...settings, [key]: !settings[key] };
        if (writeAppSettings(next)) {
            setSettings(next);
            setError(null);
        } else setError("Couldn't save the setting.");
    };
    return (
        <div className="setup-screen">
            <h2>Settings</h2>
            {LABELS.map(([key, label]) => (
                <label key={key} className="settings-toggle" htmlFor={`app-${key}`}>
                    <input id={`app-${key}`} type="checkbox" checked={settings[key]} onChange={() => toggle(key)} />
                    {label}
                </label>
            ))}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
};

export default AppSettingsScreen;
