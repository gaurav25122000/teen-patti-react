// src/App.tsx
import { useState, useEffect } from 'react';
import './App.css';
import { useTeenPattiGame } from './hooks/useTeenPattiGame';
import GameSetup from './components/GameSetup';
import GameScreen from './components/GameScreen';
import type { Player } from './types/gameTypes';

function App() {
  const gameHook = useTeenPattiGame();
  const { gameState, actions } = gameHook;
  const [showSetup, setShowSetup] = useState(gameState.players.length < 2);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for the blur effect

  useEffect(() => {
    if (gameState.players.length >= 2) {
      setShowSetup(false);
    }
  }, [gameState.players.length]);

  const handleStartNewGame = (players: Player[]) => {
    actions.startNewGame(players);
    setShowSetup(false);
  };

  const handleLoadGame = () => {
    if (actions.loadGame()) {
      setShowSetup(false);
    }
  };

  // This is the normal game view
  return (
    <div className={`app-container ${isModalOpen ? 'modal-open' : ''}`}>
      <h1>Bets Manager</h1>
      {showSetup ? (
        <GameSetup
          onStartNewGame={handleStartNewGame}
          onLoadGame={handleLoadGame}
        />
      ) : (
        <GameScreen
          gameHook={gameHook}
          onShowSetup={() => setShowSetup(true)}
          onInteractionChange={setIsModalOpen} // Pass the state setter function
        />
      )}
    </div>
  );
}

export default App;