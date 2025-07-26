// src/components/OwingsModal.tsx
import React from 'react';
import type { Transaction } from '../utils/owingsLogic';
import InteractionModal from './InteractionModal';

interface OwingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    transactions: Transaction[];
}

const OwingsModal: React.FC<OwingsModalProps> = ({ isOpen, onClose, transactions }) => {
    const IconCash = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.75A.75.75 0 013 4.5h.75m0 0h.75A.75.75 0 015.25 6v.75m0 0v.75A.75.75 0 014.5 8.25h-.75m0 0h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75h.75m-6-3.75h.75a.75.75 0 01.75.75v.75m0 0v.75a.75.75 0 01-.75.75h-.75M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>;

    return (
        <InteractionModal
            isOpen={isOpen}
            onClose={onClose}
            title="Final Owings Settlement"
            theme="success"
            icon={<IconCash />}
            footerContent={<button className="btn-modal btn-modal-primary theme-success" onClick={onClose}>Done</button>}
        >
            {transactions.length > 0 ? (
                <ul className="owings-list">
                    {transactions.map((t, index) => (
                        <li key={index}>
                            <span className="from">{t.from}</span>
                            <span className="arrow">→</span>
                            <span className="to">{t.to}</span>
                            <span className="amount">₹ {t.amount.toFixed(2)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>Everyone is settled up. No transactions are needed!</p>
            )}
        </InteractionModal>
    );
};

export default OwingsModal;