import React, { useState, useEffect, useRef } from 'react';

interface ActionToastProps {
    messages: string[];
}

const ACTION_KEYWORDS = [
    'bet', 'call', 'raise', 'fold', 'check', 'win', 'lose', 'bust', 
    'hit', 'stand', 'double', 'split', 'surrender', 'all-in', 'pay', 'blackjack',
    'added', 'removed', 'break' // Added management actions too as they are significant
];

const IGNORE_KEYWORDS = [
    'turn is', 'action is', 'action starts', 'round', 'deal', 'lock', 
    'saved', 'loaded', 'warning', 'error', 'cannot', 'please', 
    'not enough', 'insufficient', 'valid', 'between hands'
];

const ActionToast: React.FC<ActionToastProps> = ({ messages }) => {
    const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    
    // We track the last PROCESSED message string to detect new ones.
    // Using length is unreliable because the game logic caps the array size (slice(-100)).
    const lastProcessedMessageRef = useRef<string | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize ref on first render to the last message so we don't show old ones
    useEffect(() => {
        if (messages.length > 0 && lastProcessedMessageRef.current === null) {
            lastProcessedMessageRef.current = messages[messages.length - 1];
        }
    }, []);

    useEffect(() => {
        if (messages.length === 0) return;

        const latestMessage = messages[messages.length - 1];

        // If no new messages at the very end, do nothing
        if (latestMessage === lastProcessedMessageRef.current) return;

        // Iterate backwards from the newest message until we hit the one we last processed
        // or until we hit a safety limit (e.g., 5 messages) to avoid scanning too much history on reloads.
        let foundSignificantMessage: string | null = null;
        const scanLimit = 5; 
        
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];

            // Stop if we've reached the message we already processed
            if (msg === lastProcessedMessageRef.current) break;

            // Stop if we've scanned too many (safety break for deep history, or when lastProcessed is lost/not found)
            if ((messages.length - 1) - i >= scanLimit) break;

            // Check if this message is significant
            const lowerMsg = msg.toLowerCase();
            const isAction = ACTION_KEYWORDS.some(keyword => lowerMsg.includes(keyword));
            const isIgnored = IGNORE_KEYWORDS.some(keyword => lowerMsg.includes(keyword));

            // We want the *latest* significant message, so the first one we find going backwards is the winner.
            if (isAction && !isIgnored) {
                foundSignificantMessage = msg;
                break; // Found it!
            }
        }

        // Update our ref to the absolute latest message so we don't process this batch again
        lastProcessedMessageRef.current = latestMessage;

        if (foundSignificantMessage) {
            setVisibleMessage(foundSignificantMessage);
            setIsVisible(true);

            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }

            timerRef.current = setTimeout(() => {
                setIsVisible(false);
                timerRef.current = null;
            }, 3000);
        }
        
    }, [messages]);

    if (!isVisible || !visibleMessage) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '80px', // Lowered slightly so it's not covering the very top edge/status bar
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(20, 20, 35, 0.95)', // Slightly more opaque/bluish-black
            color: '#fff',
            padding: '16px 32px',
            borderRadius: '12px', // More rounded
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontSize: '1.25rem', // Larger text
            fontWeight: 600, // Bolder
            textAlign: 'center',
            minWidth: '320px',
            maxWidth: '90vw',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            transition: 'opacity 0.3s ease-in-out',
            pointerEvents: 'none', // Allow clicking through
            animation: 'slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            backdropFilter: 'blur(8px)' // Glassmorphism
        }}>
            <style>
                {`
                    @keyframes slideDownFade {
                        from { transform: translate(-50%, -20px); opacity: 0; }
                        to { transform: translate(-50%, 0); opacity: 1; }
                    }
                `}
            </style>
            {visibleMessage}
        </div>
    );
};

export default ActionToast;
