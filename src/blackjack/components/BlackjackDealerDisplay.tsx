// src/blackjack/components/BlackjackDealerDisplay.tsx
import React from 'react';

interface BlackjackDealerDisplayProps {
    dealerNet: number;
}

const BlackjackDealerDisplay: React.FC<BlackjackDealerDisplayProps> = ({ dealerNet }) => {
    
    const getNetColor = () => {
        if (dealerNet > 0) return 'var(--color-glow-lime)'; // Dealer is winning
        if (dealerNet < 0) return 'var(--color-glow-magenta)'; // Dealer is losing
        return 'var(--color-text)';
    };

    return (
        <div 
            className="dealer-display" 
            style={{ 
                padding: '1rem',
                border: '1px solid var(--color-glow-cyan)',
                borderRadius: '8px',
                textAlign: 'center',
                backgroundColor: 'var(--color-bg)'
            }}
        >
            <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-glow-cyan)'}}>
                Dealer Net
            </h4>
            <div 
                style={{
                    fontSize: '2rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 'bold',
                    color: getNetColor(),
                    textShadow: `0 0 5px ${getNetColor()}`
                }}
            >
                ₹{dealerNet.toFixed(2)}
            </div>
        </div>
    );
};

export default BlackjackDealerDisplay;