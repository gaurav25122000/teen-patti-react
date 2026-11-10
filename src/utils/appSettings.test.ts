import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SETTINGS_KEY, readAppSettings, writeAppSettings } from './appSettings.ts';

const store = (value: string | null) => ({ getItem: (key: string) => (key === APP_SETTINGS_KEY ? value : null) });

test('app settings default on; each saved boolean overrides its default, anything else is ignored', () => {
    const on = { sounds: true, haptics: true, keepAwake: true, confirmFold: true };
    assert.deepEqual(readAppSettings(store(null)), on);
    assert.deepEqual(readAppSettings(store('not json')), on);
    assert.deepEqual(readAppSettings(store('{"sounds":false,"haptics":"no","extra":1}')), { ...on, sounds: false });
    let saved = '';
    assert.equal(writeAppSettings({ ...on, keepAwake: false }, { setItem: (_k, v) => { saved = v; } }), true);
    assert.deepEqual(readAppSettings(store(saved)), { ...on, keepAwake: false });
    assert.equal(writeAppSettings(on, { setItem: () => { throw new Error('full'); } }), false);
});
