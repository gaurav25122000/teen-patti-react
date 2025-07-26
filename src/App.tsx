// src/App.tsx
import { useState } from 'react';
import './App.css';
import { useTeenPattiGame } from './hooks/useTeenPattiGame';
import { usePokerGame } from './hooks/usePokerGame';
import GameSetup from './components/GameSetup';
import GameScreen from './components/GameScreen';
import GameSelection from './components/GameSelection';
import PokerGameSetup from './components/PokerGameSetup';
import PokerGameScreen from './components/PokerGameScreen';
import type { Player } from './types/gameTypes';

function App() {
  const [gameType, setGameType] = useState<'normal' | 'poker' | null>(null);
  const teenPattiGameHook = useTeenPattiGame();
  const pokerGameHook = usePokerGame();
  const [showSetup, setShowSetup] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleStartNewGame = (players: Player[]) => {
    if (gameType === 'normal') {
      teenPattiGameHook.actions.startNewGame(players);
    } else if (gameType === 'poker') {
      pokerGameHook.actions.startNewGame(players);
    }
    setShowSetup(false);
  };

  const handleLoadGame = () => {
    if (teenPattiGameHook.actions.loadGame()) {
      setShowSetup(false);
    }
  };

  const handleSelectGame = (type: 'normal' | 'poker') => {
    setGameType(type);
    setShowSetup(true);
  };

  const renderGameContent = () => {
    if (!gameType) {
      return <GameSelection onSelectGame={handleSelectGame} />;
    }

    if (gameType === 'normal') {
      return teenPattiGameHook.gameState.players.length < 2 || showSetup ? (
        <GameSetup
          onStartNewGame={handleStartNewGame}
          onLoadGame={handleLoadGame}
        />
      ) : (
        <GameScreen
          gameHook={teenPattiGameHook}
          onShowSetup={() => setShowSetup(true)}
          onInteractionChange={setIsModalOpen}
        />
      );
    }

    if (gameType === 'poker') {
      return pokerGameHook.gameState.players.length < 2 || showSetup ? (
        <PokerGameSetup onStartNewGame={handleStartNewGame} />
      ) : (
        <PokerGameScreen gameHook={pokerGameHook} />
      );
    }

    return null;
  };

  return (
    <div className={`app-container ${isModalOpen ? 'modal-open' : ''}`}>
      <h1>Bets Manager</h1>
      {renderGameContent()}
    </div>
  );
}

export default App;