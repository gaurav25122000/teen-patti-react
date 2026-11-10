import React, { useState } from 'react';
import { cue } from '../utils/feedback';
import { formatAmount } from '../utils/formatters';
import { parseAmount } from '../utils/money';

export interface PanelButton {
    label: string;
    onClick: () => void;
    theme: string; // neon variant (btn-success…); no two purposes share one within a panel
    kind?: 'primary'; // the main action: a row of its own under the others
    disabled?: boolean;
}

interface ActionPanelProps {
    info: React.ReactNode; // row 0: whose turn, state, stake, timer
    pot?: number; // shown large on the right of row 0
    infoOnPhone?: boolean; // row 0 only on one column: two columns show it in the screen instead
    stepper?: { amount: number; onAmount: (amount: number) => void; onMinus: () => void; onPlus: () => void; chips: { label: string; amount: number }[] };
    error?: string | null; // a refused action, shown under the stepper
    buttons: PanelButton[]; // fold first, then the other actions; the primary goes below them
}

// The docked panel at the foot of a game screen; every button press taps before its action.
const ActionPanel: React.FC<ActionPanelProps> = ({ info, pot, infoOnPhone, stepper, error, buttons }) => {
    const [typed, setTyped] = useState<string | null>(null); // the field's text while typing; a step or chip clears it
    const side = buttons.filter(b => b.kind !== 'primary');
    const perRow = side.length ? Math.ceil(side.length / Math.ceil(side.length / 3)) : 1; // even rows of up to three: four are two by two
    const press = (fn: () => void) => () => {
        cue('tap');
        setTyped(null);
        fn();
    };
    return (
        <div className="action-panel">
            <div className={`panel-info${infoOnPhone ? ' phone-only' : ''}`}>{info}{pot !== undefined && <span className="panel-pot">Pot ₹{formatAmount(pot)}</span>}</div>
            {stepper && (
                <div className="panel-stepper">
                    <button className="btn btn-step" onClick={press(stepper.onMinus)} aria-label="Less">−</button>
                    <label className="panel-amount">₹{/* a tap anywhere in the box opens the keyboard */}
                        <input type="text" inputMode="decimal" aria-label="Amount" value={typed ?? formatAmount(stepper.amount)}
                            onChange={e => { setTyped(e.target.value); if (e.target.value.trim() && Number.isFinite(Number(e.target.value))) stepper.onAmount(parseAmount(e.target.value)); }} />
                    </label>
                    <button className="btn btn-step" onClick={press(stepper.onPlus)} aria-label="More">+</button>
                    {stepper.chips.map(c => (
                        <button key={c.label} className="btn btn-chip" onClick={press(() => stepper.onAmount(c.amount))}>{c.label}</button>
                    ))}
                </div>
            )}
            {error && <p className="panel-error">{error}</p>}
            <div className="panel-buttons" style={{ '--per-row': perRow } as React.CSSProperties}>
                {[...side, ...buttons.filter(b => b.kind === 'primary')].map(b => (
                    <button key={b.label} className={`btn ${b.theme} panel-button ${b.kind ?? ''}`} onClick={press(b.onClick)} disabled={b.disabled}>{b.label}</button>
                ))}
            </div>
        </div>
    );
};

export default ActionPanel;
