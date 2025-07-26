// src/components/PokerInteractionModal.tsx
import React from 'react';
import './Poker.css';

interface PokerInteractionModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footerContent?: React.ReactNode;
}

const PokerInteractionModal: React.FC<PokerInteractionModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footerContent,
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-container">
            <div className="modal-header">
                <h3 className="modal-title">{title}</h3>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
            </div>
            <div className="modal-body">{children}</div>
            {footerContent && <div className="modal-footer">{footerContent}</div>}
        </div>
    );
};

export default PokerInteractionModal;
