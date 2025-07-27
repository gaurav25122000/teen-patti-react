// src/App.tsx
import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import './App.css';

// Teen Patti Imports
import { useTeenPattiGame } from './hooks/useTeenPattiGame';
import GameSetup from './components/GameSetup';
import GameScreen from './components/GameScreen';

// Poker Imports
import { usePokerGame } from './poker/hooks/usePokerGame';
import PokerLobby from './poker/components/PokerLobby';

// General Components
import ModeSelectionScreen from './components/ModeSelectionScreen';
import LifetimeWinnings from './components/lifetime-winnings/LifetimeWinnings';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Memoize the callback to prevent re-renders
  const handleInteractionChange = useCallback((isOpen: boolean) => {
    setIsModalOpen(isOpen);
  }, []);

  // Teen Patti Hooks
  const teenPattiHook = useTeenPattiGame();

  // Poker Hooks
  const pokerHook = usePokerGame();

  // --- Teen Patti Route Component ---
  const TeenPattiRoute = () => {
    const showSetup = teenPattiHook.gameState.players.length < 2;
    return showSetup ? (
      <GameSetup
        onStartNewGame={teenPattiHook.actions.startNewGame}
        onLoadGame={teenPattiHook.actions.loadGame}
      />
    ) : (
      <GameScreen
        gameHook={teenPattiHook}
        onShowSetup={() => teenPattiHook.actions.startNewGame([])}
      />
    );
  };

  return (
    <div className={`app-container ${isModalOpen ? 'modal-open' : ''}`}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <h1>Bets Manager</h1>
      </Link>
      <Routes>
        <Route path="/" element={<ModeSelectionScreen />} />
        <Route path="/teen-patti" element={<TeenPattiRoute  />} />
        <Route path="/poker" element={<PokerLobby pokerHook={pokerHook} onInteractionChange={handleInteractionChange} />} />
        <Route path="/lifetime-winnings" element={<LifetimeWinnings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;