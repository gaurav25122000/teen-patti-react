import React from 'react';
import type { Form } from '../utils/gameSettings';
import type { FieldSpec } from '../utils/settingsFields';

interface SettingsFieldsProps {
    fields: FieldSpec[];
    form: Form;
    onChange: (form: Form) => void;
}

// The settings form, used in setup's "Table settings" section and in the Settings sheet. Blank means off.
const SettingsFields: React.FC<SettingsFieldsProps> = ({ fields, form, onChange }) => (
    <div className="settings-fields">
        {fields.map(f => {
            const id = `setting-${f.key}`;
            const set = (value: string) => onChange({ ...form, [f.key]: value });
            if (f.kind === 'toggle') {
                return (
                    <label key={f.key} className="settings-toggle" htmlFor={id}>
                        <input id={id} type="checkbox" checked={form[f.key] === 'on'} onChange={e => set(e.target.checked ? 'on' : '')} />
                        {f.label}
                    </label>
                );
            }
            if (f.kind === 'choice') {
                return (
                    <div className="form-group" key={f.key}>
                        <label htmlFor={id}>{f.label}</label>
                        <select id={id} value={form[f.key] ?? ''} onChange={e => set(e.target.value)}>
                            {f.options!.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </div>
                );
            }
            return (
                <div className="form-group" key={f.key}>
                    <label htmlFor={id}>{f.label}</label>
                    <input id={id} type="text" inputMode={f.kind === 'count' ? 'numeric' : f.kind === 'text' ? 'text' : 'decimal'} placeholder={f.placeholder ?? 'Off'}
                        value={form[f.key] ?? ''} onChange={e => set(e.target.value)} />
                </div>
            );
        })}
    </div>
);

export default SettingsFields;
