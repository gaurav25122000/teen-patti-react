// src/components/ModeSelectionScreen.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const ModeSelectionScreen: React.FC = () => {
  return (
    <div className="setup-screen">
      <h2>Choose Your Game</h2>
      <p>Select which bets manager you would like to use.</p>
      <div className="setup-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
        <Link to="/teen-patti" className="btn btn-primary" style={{ padding: '20px 40px', fontSize: '1.5rem', textDecoration: 'none' }}>
          Teen Patti Manager
        </Link>
        <Link to="/poker" className="btn btn-success" style={{ padding: '20px 40px', fontSize: '1.5rem', textDecoration: 'none' }}>
          Poker Manager
        </Link>
      </div>
    </div>
  );
};

export default ModeSelectionScreen;