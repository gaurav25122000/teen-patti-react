// src/App.tsx
import { useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import './App.css';

// Teen Patti Imports
import { useTeenPattiGame } from './hooks/useTeenPattiGame';
import GameSetup from './components/GameSetup';
const GameScreen = lazy(() => import('./components/GameScreen'));

// Poker Imports
import { usePokerGame } from './poker/hooks/usePokerGame';
const PokerLobby = lazy(() => import('./poker/components/PokerLobby'));

// Blackjack Imports
import { useBlackjackGame } from './blackjack/hooks/useBlackjackGame';
const BlackjackLobby = lazy(() => import('./blackjack/components/BlackjackLobby'));

// General Components
import ModeSelectionScreen from './components/ModeSelectionScreen';
import Toaster from './components/Toaster';
const LifetimeWinnings = lazy(() => import('./components/LifetimeWinnings'));
const SavedPlayersScreen = lazy(() => import('./components/SavedPlayersScreen'));
const HistoryScreen = lazy(() => import('./components/HistoryScreen'));
const SpectatorWrapper = lazy(() => import('./components/SpectatorWrapper'));

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleInteractionChange = useCallback((isOpen: boolean) => {
    setIsModalOpen(isOpen);
  }, []);

  const teenPattiHook = useTeenPattiGame();
  const pokerHook = usePokerGame();
  const blackjackHook = useBlackjackGame();

  // Plain element, not a component defined here: a new component type each render remounts GameScreen and kills its stream.
  const teenPattiElement = teenPattiHook.gameState.players.length < 2 ? (
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

  return (
    <div className={`app-container ${isModalOpen ? 'modal-open' : ''}`}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <h1>Bets Manager</h1>
      </Link>
      <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route path="/" element={<ModeSelectionScreen />} />
        <Route path="/teen-patti" element={teenPattiElement} />
        <Route path="/poker" element={<PokerLobby pokerHook={pokerHook} onInteractionChange={handleInteractionChange} />} />
        {/* --- UPDATED ROUTE --- */}
        <Route path="/blackjack" element={<BlackjackLobby blackjackHook={blackjackHook} onInteractionChange={handleInteractionChange} />} />
        <Route path="/watch/:streamId" element={<SpectatorWrapper />} />
        <Route path="/lifetime-winnings" element={<LifetimeWinnings />} />
        <Route path="/saved-players" element={<SavedPlayersScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>
      <Toaster />
    </div>
  );
}

export default App;