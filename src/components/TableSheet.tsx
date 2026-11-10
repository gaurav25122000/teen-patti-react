import React from 'react';
import InteractionModal from './InteractionModal';
import { cue } from '../utils/feedback';

export interface SheetItem {
    icon: string;
    label: string;
    onClick: () => void;
    danger?: boolean; // End game: magenta
}

// One labelled Table sheet per game: Players, Money and Game groups; empty groups are left out.
const TableSheet: React.FC<{ groups: [string, SheetItem[]][]; onClose: () => void }> = ({ groups, onClose }) => (
    <InteractionModal isOpen={true} onClose={onClose} title="Table" theme="default"
        footerContent={<button className="btn-modal btn-modal-secondary" onClick={onClose}>Close</button>}>
        {groups.filter(([, items]) => items.length > 0).map(([title, items]) => (
            <div key={title} className={`sheet-group sheet-${title.toLowerCase()}`}>
                <h4>{title}</h4>
                {items.map(item => (
                    <button key={item.label} className={`sheet-item${item.danger ? ' danger' : ''}`} onClick={() => { cue('tap'); onClose(); item.onClick(); }}>
                        <span aria-hidden="true">{item.icon}</span> {item.label}
                    </button>
                ))}
            </div>
        ))}
    </InteractionModal>
);

export default TableSheet;
