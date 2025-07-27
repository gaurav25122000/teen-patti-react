// src/components/lifetime-winnings/LifetimeWinnings.tsx
import React, { useState } from 'react';
import WinningsDisplay from './WinningsDisplay';
import './LifetimeWinnings.css';

const LifetimeWinnings: React.FC = () => {
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(['']);
  const [winnings, setWinnings] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneNumberChange = (index: number, value: string) => {
    const newPhoneNumbers = [...phoneNumbers];
    newPhoneNumbers[index] = value;
    setPhoneNumbers(newPhoneNumbers);
  };

  const handleAddPhoneNumber = () => {
    setPhoneNumbers([...phoneNumbers, '']);
  };

  const handleFetchWinnings = async () => {
    setError(null);
    setWinnings(null);

    if (phoneNumbers.some(num => !num.trim())) {
      setError('Phone numbers cannot be empty.');
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/getWinnings', {
        method: 'POST',
        body: JSON.stringify({ phoneNumbers }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch winnings data.');
      }

      const data = await response.json();
      setWinnings(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="setup-screen">
      <h2>Lifetime Winnings</h2>
      <div className="setup-actions">
        {phoneNumbers.map((phoneNumber, index) => (
          <input
            key={index}
            type="text"
            placeholder="Enter Phone Number"
            value={phoneNumber}
            onChange={(e) => handlePhoneNumberChange(index, e.target.value)}
            style={{ margin: '5px 0' }}
          />
        ))}
        <button className="btn-secondary" onClick={handleAddPhoneNumber}>
          Add Another Player
        </button>
        <button className="btn-primary" onClick={handleFetchWinnings}>
          Fetch Winnings
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
      {winnings && <WinningsDisplay winnings={winnings} />}
    </div>
  );
};

export default LifetimeWinnings;
