// src/components/InteractionModal.tsx

import React from 'react';

// Define the props for our new, more flexible modal
interface InteractionModalProps {
  // --- Core modal content ---
  title: string;
  theme?: 'confirmation' | 'danger' | 'success' | 'default';
  icon?: React.ReactNode;
  children: React.ReactNode; // For the main body content
  footerContent: React.ReactNode; // For the buttons in the footer
  
  // --- Control functions ---
  onClose: () => void;
  isOpen: boolean;
}

const InteractionModal: React.FC<InteractionModalProps> = ({
  isOpen,
  onClose,
  title,
  theme = 'default',
  icon,
  children,
  footerContent
}) => {
  // If the modal isn't open, render nothing
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-container">
      {/* Close button in the top right */}
      <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
        &times;
      </button>

      {/* Header with dynamic color, icon, and title */}
      <div className={`modal-header theme-${theme}`}>
        {icon && <div className="modal-icon">{icon}</div>}
        <h3 className="modal-title">{title}</h3>
      </div>

      {/* Main body where the form/message goes */}
      <div className="modal-body">
        {children}
      </div>

      {/* Footer where the action buttons go */}
      <div className="modal-footer">
        {footerContent}
      </div>
    </div>
  );
};

export default InteractionModal;