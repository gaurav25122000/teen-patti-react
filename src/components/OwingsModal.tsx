// src/components/OwingsModal.tsx
import React, { useEffect, useState } from 'react';
import { cue } from '../utils/feedback';
import { throughTransfers, type Party, type Transaction } from '../utils/owingsLogic';
import InteractionModal from './InteractionModal';
import ShareButtons from './ShareButtons';
import PayLink from './PayLink';
import Avatar from './Avatar';
import { loadSavedPlayers } from '../utils/savedPlayers';
import { isUnbalanced, shareText, upiFor } from '../utils/settlement';
import { GAME_LABELS, type GameKind } from '../utils/nightStats';

interface OwingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    transactions: Transaction[];
    summary?: string[];
    notice?: string; // shown instead of transfers (a tournament in progress)
    parties?: Party[]; // for "Through <person>"
    game: GameKind;
}

const IconCash = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.75A.75.75 0 013 4.5h.75m0 0h.75A.75.75 0 015.25 6v.75m0 0v.75A.75.75 0 014.5 8.25h-.75m0 0h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75h.75m-6-3.75h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-.75.75h-.75M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>;

// Mounted only while open, so saved players are re-read and notes clear each time.
const OwingsContent: React.FC<Omit<OwingsModalProps, 'isOpen'>> = ({ onClose, transactions: fewest, summary = [], notice, parties = [], game }) => {
    const [{ list: saved, failed: savedFailed }] = useState(() => loadSavedPlayers());
    const [payNote, setPayNote] = useState<string | null>(null);
    const [hub, setHub] = useState(-1); // -1: fewest transfers
    useEffect(() => cue('settle'), []);
    const transactions = hub < 0 ? fewest : throughTransfers(parties, hub);

    return (
        <InteractionModal
            isOpen={true}
            onClose={onClose}
            title="Final Owings Settlement"
            theme="success"
            icon={<IconCash />}
            footerContent={<button className="btn-modal btn-modal-primary theme-success" onClick={onClose}>Done</button>}
        >
            {!notice && parties.length > 2 && (
                <select aria-label="Settle" value={hub} onChange={e => setHub(Number(e.target.value))}>
                    <option value={-1}>Fewest transfers</option>
                    {parties.map((p, i) => <option key={p.label} value={i}>Through {p.label}</option>)}
                </select>
            )}
            {notice ? <p>{notice}</p> : transactions.length > 0 ? (
                <ul className="owings-list">
                    {transactions.map((t, index) => {
                        const upi = upiFor(t.toPhone, saved);
                        return (
                            <li key={index}>
                                <span className="from"><Avatar name={t.from} /> {t.from}</span>
                                <span className="arrow">→</span>
                                <span className="to"><Avatar name={t.to} phone={t.toPhone ?? undefined} saved={saved} /> {t.to}</span>
                                <span className="amount">₹ {t.amount.toFixed(2)}</span>
                                {upi && <PayLink upi={upi} payee={t.to} amount={t.amount} onNoApp={setPayNote} />}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p>{isUnbalanced(summary) ? 'No transfers between players.' : 'All settled up! No transfers needed.'}</p>
            )}
            {savedFailed && <p className="share-note">Couldn't load saved players, so PAY is unavailable.</p>}
            {payNote && <p className="share-note">{payNote}</p>}
            {summary.length > 0 && (
                <>
                    <h4>Night summary</h4>
                    <ul className="summary-list">{summary.map(line => <li key={line}>{line}</li>)}</ul>
                </>
            )}
            {!notice && (transactions.length > 0 || summary.length > 0) && <ShareButtons text={shareText(transactions, summary, saved)} subtitle={`${GAME_LABELS[game]} · ${new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}`} />}
        </InteractionModal>
    );
};

const OwingsModal: React.FC<OwingsModalProps> = ({ isOpen, ...props }) => (isOpen ? <OwingsContent {...props} /> : null);

export default OwingsModal;
