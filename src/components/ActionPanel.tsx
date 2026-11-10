import React, { useState } from 'react';
import { cue } from '../utils/feedback';
import { formatAmount } from '../utils/formatters';

export interface PanelButton {
    label: string;
    onClick: () => void;
    kind?: 'fold' | 'primary';
    disabled?: boolean;
}

interface ActionPanelProps {
    info: React.ReactNode; // row 0: whose turn, state, stake, timer
    stepper?: { amount: number; onAmount: (amount: number) => void; onMinus: () => void; onPlus: () => void; chips: { label: string; amount: number }[] };
    error?: string | null; // a refused action, shown under the stepper
    buttons: PanelButton[]; // row 2: fold first, secondary actions, primary last
}

// The docked panel at the foot of a game screen; every button press taps before its action.
const ActionPanel: React.FC<ActionPanelProps> = ({ info, stepper, error, buttons }) => {
    const [typed, setTyped] = useState<string | null>(null); // the field's text while typing; a step or chip clears it
    const press = (fn: () => void) => () => {
        cue('tap');
        setTyped(null);
        fn();
    };
    return (
        <div className="action-panel">
            <div className="panel-info">{info}</div>
            {stepper && (
                <div className="panel-stepper">
                    <button className="panel-step" onClick={press(stepper.onMinus)} aria-label="Less">−</button>
                    <input type="text" inputMode="decimal" aria-label="Amount" value={typed ?? formatAmount(stepper.amount)}
                        onChange={e => { setTyped(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(n)) stepper.onAmount(n); }} />
                    <button className="panel-step" onClick={press(stepper.onPlus)} aria-label="More">+</button>
                    {stepper.chips.map(c => (
                        <button key={c.label} className="panel-chip" onClick={press(() => stepper.onAmount(c.amount))}>{c.label}</button>
                    ))}
                </div>
            )}
            {error && <p className="panel-error">{error}</p>}
            <div className="panel-buttons">
                {buttons.map(b => (
                    <button key={b.label} className={`panel-button ${b.kind ?? ''}`} onClick={press(b.onClick)} disabled={b.disabled}>{b.label}</button>
                ))}
            </div>
        </div>
    );
};

export default ActionPanel;
