import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import type { Player, GameState } from './types';

const LOCAL_STORAGE_KEY = 'teenPattiGameState';

function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    // Load initial state from localStorage or set defaults
    console.log("Attempting to load state from localStorage..."); // Debug log
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        console.log("Successfully parsed saved state:", parsed); // Debug log
        // Need to parse Set from array
        return { ...parsed, foldedPlayerIds: new Set(parsed.foldedPlayerIds || []) };
      } catch (error) {
        console.error("Failed to parse saved state from localStorage:", error); // Log potential error
      }
    }
    console.log("No valid saved state found, using default state."); // Debug log
    return {
      players: [],
      lastWinnerId: null,
      roundActive: false,
      currentPlayerIndex: -1, // No player initially
      currentStake: 0,
      potAmount: 0,
      foldedPlayerIds: new Set<number>(),
      messages: ["Welcome! Load a game or set up a new one."],
    };
  });

  const [showSetup, setShowSetup] = useState(gameState.players.length < 2);
  const [numPlayersInput, setNumPlayersInput] = useState("2");
  const [playerInputs, setPlayerInputs] = useState<{ name: string; balance: string }[]>([]);
  const [betAmountInput, setBetAmountInput] = useState("");

  // State for inline forms/modals replacement
  const [interactionState, setInteractionState] = useState<'idle' | 'gettingBoot' | 'gettingStartPlayer' | 'addingPlayer' | 'removingPlayer' | 'selectingWinner' | 'showingCards'>('idle');
  const [bootAmountInput, setBootAmountInput] = useState("10");
  const [addPlayerNameInput, setAddPlayerNameInput] = useState("");
  const [addPlayerBalanceInput, setAddPlayerBalanceInput] = useState("0");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(""); // For selections (start, remove, win)
  const [showPrecedingPlayerId, setShowPrecedingPlayerId] = useState<number | null>(null); // Store the ID of the player being shown against

  // Ref for the action log container
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- Persistence ---
  useEffect(() => {
    // Save state to localStorage whenever it changes
    // Convert Set to array for JSON serialization
    const stateToSave = {
      ...gameState,
      foldedPlayerIds: Array.from(gameState.foldedPlayerIds)
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [gameState]);

  // Effect to auto-fill bet amount input with current stake
  useEffect(() => {
    if (gameState.roundActive) {
      // Set the input field to the current minimum bet (stake)
      setBetAmountInput(String(gameState.currentStake));
    }
  }, [gameState.roundActive, gameState.currentPlayerIndex, gameState.currentStake]); // Re-run when turn changes or stake changes

  // Effect to scroll action log to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      const { scrollHeight } = logContainerRef.current;
      logContainerRef.current.scrollTop = scrollHeight;
    }
  }, [gameState.messages]); // Re-run whenever messages array changes


  // --- Utility Functions ---
  const addMessage = useCallback((message: string, isError: boolean = false) => {
    console.log(message); // Also log to console for debugging
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages.slice(-100), `${isError ? "ERROR: " : ""}${message}`] // Keep last 100 messages
    }));
  }, []);

  // Helper function for Title Case
  const toTitleCase = (str: string): string => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // --- Utility Functions --- Moved Up ---
  const getCurrentPlayer = (): Player | null => {
    if (!gameState.roundActive || gameState.currentPlayerIndex < 0 || gameState.currentPlayerIndex >= gameState.players.length) {
      return null;
    }
    return gameState.players[gameState.currentPlayerIndex];
  };

  const getActivePlayers = (): Player[] => {
    return gameState.players.filter(p => !gameState.foldedPlayerIds.has(p.id));
  };

  // Helper to find the active player immediately before the current one
  const findPrecedingActivePlayer = (): Player | null => {
    const numPlayers = gameState.players.length;
    if (numPlayers < 2 || !currentPlayer) return null;

    let currentIndex = gameState.currentPlayerIndex;
    let attempts = 0;

    do {
      currentIndex = (currentIndex - 1 + numPlayers) % numPlayers; // Move backwards
      const precedingPlayer = gameState.players[currentIndex];

      // Check if it's an active player and not the current player
      if (
        precedingPlayer.id !== currentPlayer.id &&
        !gameState.foldedPlayerIds.has(precedingPlayer.id)
      ) {
        return precedingPlayer;
      }
      attempts++;
    } while (attempts < numPlayers);

    return null; // Should only happen if only one active player left
  };

  // --- Derived State --- Moved Down ---
  const activePlayers = getActivePlayers(); // Calculate once
  const currentPlayer = getCurrentPlayer(); // Calculate once

  // --- Setup Logic ---
  const handleConfirmNumPlayers = () => {
    const num = parseInt(numPlayersInput);
    if (isNaN(num) || num < 2) {
      alert("Please enter at least 2 players.");
      return;
    }
    setPlayerInputs(Array(num).fill(null).map(() => ({ name: "", balance: "0" }))); // Default balance 0
    addMessage(`Enter details for ${num} players.`);
  };

  const handlePlayerInputChange = (index: number, field: 'name' | 'balance', value: string) => {
    setPlayerInputs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleStartNewGame = () => {
    const newPlayers: Player[] = [];
    let nextId = 1;
    for (const input of playerInputs) {
      const name = input.name.trim();
      const balance = parseInt(input.balance);
      if (!name) {
        alert(`Player ${nextId} needs a name.`);
        return;
      }
      // Allow negative starting balance if entered, otherwise default to 0 if invalid
      if (isNaN(balance)) {
        alert(`Invalid starting balance for ${name}. Must be non-negative.`);
        return;
      }
      newPlayers.push({ id: nextId, name: toTitleCase(name), balance }); // Title case on creation
      nextId++;
    }

    if (newPlayers.length < 2) {
      alert("Need at least 2 players to start.");
      return;
    }

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      lastWinnerId: null, // Reset winner
      messages: ["New game started. Add players or start a round."]
    }));
    setShowSetup(false);
    addMessage(`New game started with ${newPlayers.length} players.`);
  };

  const handleLoadGame = () => {
     const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
     if (savedState) {
       const parsed = JSON.parse(savedState);
       if (parsed.players && parsed.players.length >= 2) {
         setGameState({ ...parsed, foldedPlayerIds: new Set(parsed.foldedPlayerIds || []) });
         setShowSetup(false);
         addMessage("Saved game loaded.");
       } else {
         alert("Loaded game has invalid player data. Starting fresh setup.");
         localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid state
         setGameState(prev => ({...prev, players: [], messages: ["Load failed. Set up a new game."]}));
         setShowSetup(true);
       }
     } else {
       alert("No saved game found.");
     }
  };

  // --- Game Logic ---

  const advanceTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev.roundActive) return prev;

      const numPlayers = prev.players.length;
      if (numPlayers === 0) return prev; // Should not happen

      let nextIndex = prev.currentPlayerIndex;
      let attempts = 0;
      do {
        nextIndex = (nextIndex + 1) % numPlayers;
        attempts++;
        // Check if next player is active
        if (!prev.foldedPlayerIds.has(prev.players[nextIndex].id)) {
          return { ...prev, currentPlayerIndex: nextIndex };
        }
      } while (attempts <= numPlayers); // Prevent infinite loop if all folded (should be caught earlier)

      // If loop finishes, something is wrong (maybe only one player left?)
      addMessage("Error advancing turn.", true);
      return { ...prev, roundActive: false }; // End round defensively
    });
  }, [addMessage]);

  const checkForWinner = useCallback((currentPlayers: Player[], foldedIds: Set<number>): Player | null => {
      const activePlayers = currentPlayers.filter(p => !foldedIds.has(p.id));
      return activePlayers.length === 1 ? activePlayers[0] : null;
  }, []);

  const endRound = useCallback((winner: Player | null) => {
    setGameState(prev => {
      let messages = [...prev.messages];
      let newPlayers = prev.players;
      let newLastWinnerId = prev.lastWinnerId;

      if (winner) {
        messages.push(`Congratulations! ${winner.name} won the pot of Rs. ${prev.potAmount}`);
        newPlayers = prev.players.map(p =>
          p.id === winner.id ? { ...p, balance: p.balance + prev.potAmount } : p
        );
        newLastWinnerId = winner.id;
      } else {
        messages.push("Round ended with no winner determined.");
        // Pot is lost? Or return bets? Simplest is pot is lost.
      }

      return {
        ...prev,
        players: newPlayers,
        lastWinnerId: newLastWinnerId,
        roundActive: false,
        currentPlayerIndex: -1,
        currentStake: 0,
        potAmount: 0,
        foldedPlayerIds: new Set<number>(),
        messages: messages,
      };
    });
  }, []);

  const handleStartRound = () => {
    if (gameState.players.length < 2) {
      alert("Need at least 2 players.");
      return;
    }

    // Instead of prompting, set state to show boot input
    setInteractionState('gettingBoot');
    let startingPlayerIndex = -1;

    if (gameState.lastWinnerId !== null) {
      const winnerIndex = gameState.players.findIndex(p => p.id === gameState.lastWinnerId);
      if (winnerIndex !== -1) {
        startingPlayerIndex = (winnerIndex + 1) % gameState.players.length;
        addMessage(`Last winner: ${gameState.players[winnerIndex].name}. Starting with: ${gameState.players[startingPlayerIndex].name}.`);
      }
    }

    // Store potential starting player index temporarily if known
    // We'll use it after getting boot amount
    setGameState(prev => ({ ...prev, currentPlayerIndex: startingPlayerIndex }));
  };

  // Called after user enters boot amount
  const handleConfirmBootAmount = () => {
    const bootAmount = parseInt(bootAmountInput);
    if (isNaN(bootAmount) || bootAmount <= 0) {
      alert("Invalid boot amount. Must be a positive number.");
      return;
    }

    let startingPlayerIndex = gameState.currentPlayerIndex; // Get potentially pre-calculated index

    if (startingPlayerIndex === -1) {
      // Need to select starting player
      setSelectedPlayerId(gameState.players.length > 0 ? String(gameState.players[0].id) : ""); // Default selection
      setInteractionState('gettingStartPlayer');
      // Store boot amount temporarily before proceeding
      setGameState(prev => ({ ...prev, currentStake: bootAmount })); // Use currentStake temporarily
      return;
    }

    // If starting player is known, proceed directly
    startRoundWithPlayer(startingPlayerIndex, bootAmount);
  };

  // Called after user selects starting player
  const handleConfirmStartingPlayer = () => {
      const startPlayerId = parseInt(selectedPlayerId);
      const startingPlayerIndex = gameState.players.findIndex(p => p.id === startPlayerId);
      const bootAmount = gameState.currentStake; // Retrieve stored boot amount

      if (startingPlayerIndex === -1 || bootAmount <= 0) {
          alert("Invalid starting player selection or boot amount.");
          setInteractionState('idle'); // Reset state
          setGameState(prev => ({ ...prev, currentStake: 0, currentPlayerIndex: -1 })); // Clear temp storage
          return;
      }
      addMessage(`Starting player selected: ${toTitleCase(gameState.players[startingPlayerIndex].name)}.`);
      startRoundWithPlayer(startingPlayerIndex, bootAmount);
  };

  // Common function to actually start the round state update
  const startRoundWithPlayer = (startingPlayerIndex: number, bootAmount: number) => {
    // Deduct boot and update state
    setGameState(prev => {
        let newPot = 0;
        const updatedPlayers = prev.players.map(p => {
            newPot += bootAmount;
            return {...p, balance: p.balance - bootAmount};
        });
        addMessage(`Collecting Boot Amount: Rs. ${bootAmount} from each player. Pot: Rs. ${newPot}`);
        return {
            ...prev,
            players: updatedPlayers,
            roundActive: true,
            currentPlayerIndex: startingPlayerIndex,
            currentStake: bootAmount,
            potAmount: newPot,
            foldedPlayerIds: new Set<number>(),
            messages: [...prev.messages, `Round started. Stake: Rs. ${bootAmount}. Turn: ${toTitleCase(updatedPlayers[startingPlayerIndex].name)}`],
        };
    });
    setInteractionState('idle'); // Back to normal game state
  };

   const handleBet = () => {
      const player = getCurrentPlayer();
      if (!player) return;

      const betAmount = parseInt(betAmountInput);

      if (isNaN(betAmount)) {
          alert("Invalid bet amount.");
          return;
      }

      if (betAmount === 0) { // Treat 0 bet as fold
          handleFold();
          return;
      }

      if (betAmount < gameState.currentStake) {
          alert(`Bet must be at least the current stake of Rs. ${gameState.currentStake}.`);
          return;
      }

      // Removed the check for player.balance < betAmount to allow negative balances

      // Process bet
      setGameState(prev => {
          const newPlayers = prev.players.map(p =>
              p.id === player.id ? { ...p, balance: p.balance - betAmount } : p
          );
          const newStake = Math.max(prev.currentStake, betAmount);
          let messages = [...prev.messages, `${toTitleCase(player.name)} bets Rs. ${betAmount}.`];
          if (newStake > prev.currentStake) {
              messages.push(`Stake increased to Rs. ${newStake}.`);
          }

          return {
              ...prev,
              players: newPlayers,
              potAmount: prev.potAmount + betAmount,
              currentStake: newStake,
              messages: messages,
          };
      });
      // setBetAmountInput(""); // Remove clearing - useEffect will set it for the next turn
      advanceTurn();
  };

  const handleFold = () => {
      const player = getCurrentPlayer();
      if (!player) return;

      addMessage(`${toTitleCase(player.name)} folds.`);
      const newFoldedIds = new Set(gameState.foldedPlayerIds).add(player.id);

      const winner = checkForWinner(gameState.players, newFoldedIds);
      if (winner) {
          addMessage(`${toTitleCase(winner.name)} is the last player remaining and wins!`);
          endRound(winner);
      } else {
          setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds }));
          advanceTurn();
      }
  };

  // --- Simplified Show/End Betting (using prompts/confirms) ---
  // A real app would use modal components here
  // Updated handleShow to use inline modal
  const handleShow = () => {
      if (!currentPlayer || !gameState.roundActive) return;

      const precedingPlayer = findPrecedingActivePlayer();

      if (!precedingPlayer) {
          alert("Cannot Show: No preceding active player found.");
          return;
      }

      const showCost = gameState.currentStake;
      // Removed balance check: if (currentPlayer.balance < showCost) ...

      // Deduct cost, update pot, set state for modal
      setGameState(prev => {
          const updatedPlayers = prev.players.map(p =>
              p.id === currentPlayer.id ? { ...p, balance: p.balance - showCost } : p
          );
          addMessage(`${toTitleCase(currentPlayer.name)} pays Rs. ${showCost} for Show with ${toTitleCase(precedingPlayer.name)}.`);
          return {
              ...prev,
              players: updatedPlayers,
              potAmount: prev.potAmount + showCost,
          };
      });

      // Prepare for modal: store preceding player ID and set interaction state
      setShowPrecedingPlayerId(precedingPlayer.id);
      // Default selection to the requester (current player)
      setSelectedPlayerId(String(currentPlayer.id));
      setInteractionState('showingCards');
  };

  const handleEndBetting = () => {
      if (!gameState.roundActive) return;
      if (activePlayers.length <= 1) {
          alert("Not enough active players to manually end betting.");
          return; // Or automatically declare winner if only 1
      }
      setSelectedPlayerId(activePlayers.length > 0 ? String(activePlayers[0].id) : ""); // Default selection
      setInteractionState('selectingWinner');
  };

  const handleConfirmWinner = () => {
      const winnerId = parseInt(selectedPlayerId);
      const winnerChoiceIndex = activePlayers.findIndex(p => p.id === winnerId);
      if (isNaN(winnerChoiceIndex) || winnerChoiceIndex < 0 || winnerChoiceIndex >= activePlayers.length) {
          alert("Invalid winner selection.");
          return;
      }
      const winner = activePlayers[winnerChoiceIndex];
      endRound(winner);
      setInteractionState('idle');
  };

  // Called when user confirms who folds in the Show modal
  const handleConfirmShowLoser = () => {
      if (!showPrecedingPlayerId) return; // Should not happen

      const loserId = parseInt(selectedPlayerId);
      const loser = gameState.players.find(p => p.id === loserId);

      if (!loser || (loserId !== currentPlayer?.id && loserId !== showPrecedingPlayerId)) {
          alert("Invalid selection for Show loser.");
          return;
      }

      addMessage(`${toTitleCase(loser.name)} folds after the Show.`);
      const newFoldedIds = new Set(gameState.foldedPlayerIds).add(loserId);
      const winner = checkForWinner(gameState.players, newFoldedIds);

      setShowPrecedingPlayerId(null); // Clear preceding player ID
      setInteractionState('idle'); // Go back to idle state

      if (winner) { endRound(winner); }
      else { setGameState(prev => ({ ...prev, foldedPlayerIds: newFoldedIds })); advanceTurn(); }
  };
  // --- Player Management ---
  const handleAddPlayer = () => {
      if (gameState.roundActive) {
          alert("Cannot add players during an active round.");
          return;
      }
      setAddPlayerNameInput("");
      setAddPlayerBalanceInput("0");
      setInteractionState('addingPlayer');
  };

  const handleConfirmAddPlayer = () => {
      const name = addPlayerNameInput.trim();
      const balance = parseInt(addPlayerBalanceInput);
      if (isNaN(balance) || balance < 0) {
          alert("Invalid balance. Must be a non-negative number.");
          return;
      }
      const newId = gameState.players.length > 0 ? Math.max(...gameState.players.map(p => p.id)) + 1 : 1;
      const newPlayer: Player = { id: newId, name: toTitleCase(name), balance }; // Title case on creation
      setGameState(prev => ({
          ...prev,
          players: [...prev.players, newPlayer]
      }));
      addMessage(`Player ${toTitleCase(name)} added with ID ${newId}.`);
      setInteractionState('idle');
  };

  const handleRemovePlayer = () => {
       if (gameState.roundActive) {
          alert("Cannot remove players during an active round.");
          return;
      }
       if (gameState.players.length <= 2) {
          alert("Cannot remove player. Minimum 2 players required.");
          return;
      }
      setSelectedPlayerId(gameState.players.length > 0 ? String(gameState.players[0].id) : ""); // Default selection
      setInteractionState('removingPlayer');
  };

  const handleConfirmRemovePlayer = () => {
      const removeId = parseInt(selectedPlayerId);
      const removeChoiceIndex = gameState.players.findIndex(p => p.id === removeId);

       if (isNaN(removeChoiceIndex) || removeChoiceIndex < 0 || removeChoiceIndex >= gameState.players.length) {
          alert("Invalid player selection.");
          return;
       }
      const playerToRemove = gameState.players[removeChoiceIndex];
      if (confirm(`Are you sure you want to remove ${toTitleCase(playerToRemove.name)}?`)) {
          setGameState(prev => ({
              ...prev,
              players: prev.players.filter(p => p.id !== playerToRemove.id),
              // Reset last winner if removed
              lastWinnerId: prev.lastWinnerId === playerToRemove.id ? null : prev.lastWinnerId,
          }));
          addMessage(`Player ${toTitleCase(playerToRemove.name)} removed.`);
      }
      setInteractionState('idle');
  };

  return (
    <div className="app-container">
      <h1>Teen Patti Bets Manager</h1>

      {showSetup ? (
        <div className="setup-screen">
          <h2>Game Setup</h2>
          <div className="setup-actions">
             <button className="btn-secondary" onClick={handleLoadGame} disabled={!localStorage.getItem(LOCAL_STORAGE_KEY)}>Load Saved Game</button>
          </div>
          <hr/>
          <h3>Start New Game</h3>
          <div>
            <label>Number of Players (min 2): </label>
            <input
              type="number"
              min="2"
              value={numPlayersInput}
              onChange={(e) => setNumPlayersInput(e.target.value)}
              style={{width: "50px"}}
            />
            <button className="btn-primary" onClick={handleConfirmNumPlayers}>Confirm</button>
          </div>
          {playerInputs.length > 0 && (
            <div>
              <h4>Enter Player Details:</h4>
              {playerInputs.map((input, index) => (
                <div key={index}>
                  <input
                    type="text"
                    placeholder={`Player ${index + 1} Name`}
                    value={input.name}
                    onChange={(e) => handlePlayerInputChange(index, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="Balance"
                    value={input.balance} // Default is now "0" from state
                    onChange={(e) => handlePlayerInputChange(index, 'balance', e.target.value)}
                     style={{width: "80px", marginLeft: "5px"}}
                  />
                </div>
              ))}
              <button className="btn-start" onClick={handleStartNewGame} style={{marginTop: "10px"}}>Start Game</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Inline Modals/Forms */}
          {interactionState === 'gettingBoot' && (
            <div className="inline-modal">
              <h3>Start Round</h3>
              <label>Enter Boot Amount: </label>
              <input type="number" value={bootAmountInput} onChange={e => setBootAmountInput(e.target.value)} min="1" />
              <button onClick={handleConfirmBootAmount}>Confirm Boot</button>
              <button onClick={() => setInteractionState('idle')}>Cancel</button>
            </div>
          )}
          {interactionState === 'gettingStartPlayer' && (
            <div className="inline-modal">
              <h3>Select Starting Player</h3>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                {gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}
              </select>
              <button onClick={handleConfirmStartingPlayer}>Confirm Start Player</button>
              <button onClick={() => setInteractionState('idle')}>Cancel</button>
            </div>
          )}
          {interactionState === 'addingPlayer' && (
            <div className="inline-modal">
              <h3>Add Player</h3>
              <input type="text" placeholder="Name" value={addPlayerNameInput} onChange={e => setAddPlayerNameInput(e.target.value)} />
              <input type="number" placeholder="Balance" value={addPlayerBalanceInput} onChange={e => setAddPlayerBalanceInput(e.target.value)} min="0" />
              <button onClick={handleConfirmAddPlayer}>Confirm Add</button>
              <button onClick={() => setInteractionState('idle')}>Cancel</button>
            </div>
          )}
           {interactionState === 'removingPlayer' && (
            <div className="inline-modal">
              <h3>Remove Player</h3>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                {gameState.players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}
              </select>
              <button onClick={handleConfirmRemovePlayer}>Confirm Remove</button>
              <button onClick={() => setInteractionState('idle')}>Cancel</button>
            </div>
          )}
          {interactionState === 'selectingWinner' && (
            <div className="inline-modal">
              <h3>Select Round Winner</h3>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                {activePlayers.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)}</option>)}
              </select>
              <button onClick={handleConfirmWinner}>Confirm Winner</button>
              <button onClick={() => setInteractionState('idle')}>Cancel</button>
            </div>
          )}
          {interactionState === 'showingCards' && currentPlayer && showPrecedingPlayerId && (
            <div className="inline-modal">
              <h3>Show Result</h3>
              <p>Between {toTitleCase(currentPlayer.name)} (Requester) and {toTitleCase(gameState.players.find(p=>p.id===showPrecedingPlayerId)?.name || 'Unknown')}.</p>
              <label>Select who FOLDS:</label>
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                 {/* Only show the two players involved */}
                 <option value={currentPlayer.id}>{toTitleCase(currentPlayer.name)}</option>
                 <option value={showPrecedingPlayerId}>
                    {toTitleCase(gameState.players.find(p=>p.id===showPrecedingPlayerId)?.name || 'Unknown')}
                 </option>
              </select>
              <button onClick={handleConfirmShowLoser}>Confirm Fold</button>
              <button onClick={() => { setInteractionState('idle'); setShowPrecedingPlayerId(null); }}>Cancel</button>
            </div>
          )}

          {/* Main Game Screen (Hidden if an interaction is active) */}
          {interactionState === 'idle' && (
            <div className="game-screen">
          {/* Player List Area */}
          <div className="player-list">
            <h3>Players ({gameState.players.length})</h3>
             {gameState.players.length === 0 && <p>No players yet. Add some!</p>}
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Balance</th><th>Status</th></tr>
              </thead>
              <tbody>
                {gameState.players.map(p => {
                  const isFolded = gameState.foldedPlayerIds.has(p.id);
                  const isCurrent = gameState.roundActive && currentPlayer?.id === p.id;
                  let status = "Waiting";
                  if (gameState.roundActive) {
                      status = isFolded ? "Folded" : (isCurrent ? "Current Turn" : "Active");
                  }
                  const className = `${isFolded ? 'folded' : ''} ${isCurrent ? 'current-player' : ''}`;
                  return (
                    <tr key={p.id} className={className}>
                      <td>{p.id}</td>
                      <td>{toTitleCase(p.name)}</td>
                      <td>Rs. {p.balance}</td>
                      <td>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions and Log Area */}
          <div>
            <div className="game-actions">
              <button className="btn-primary" onClick={handleStartRound} disabled={gameState.roundActive || gameState.players.length < 2}>Start New Round</button>
              <button className="btn-primary" onClick={handleAddPlayer} disabled={gameState.roundActive}>Add Player</button>
              <button className="btn-secondary" onClick={handleRemovePlayer} disabled={gameState.roundActive || gameState.players.length <= 2}>Remove Player</button>
              <button className="btn-secondary" onClick={() => setShowSetup(true)}>Back to Setup</button>
            </div>

            {gameState.roundActive && currentPlayer && (
              <div className="round-controls">
                 <div className="round-info">
                    <div><strong>Turn: {toTitleCase(currentPlayer.name)} (ID: {currentPlayer.id})</strong></div>
                    <div>Current Stake: Rs. {gameState.currentStake}</div>
                    <div>Pot Amount: Rs. {gameState.potAmount}</div>
                 </div>
                 <input
                    type="number"
                    placeholder="Bet Amount"
                    value={betAmountInput}
                    onChange={(e) => setBetAmountInput(e.target.value)}
                    min="0"
                 />
                 <button onClick={handleBet} className="btn-bet">Bet / Chaal</button>
                 <button onClick={handleFold} className="btn-fold">Fold (0)</button>
                 <button onClick={handleShow} title="Show UI not fully implemented" className="btn-show">Show (-2)</button>
                 <button onClick={handleEndBetting} className="btn-end">End Betting (-1)</button>
              </div>
            )}

            <div className="action-log" ref={logContainerRef}> {/* Assign the ref here */}
              {gameState.messages.map((msg, index) => (
                <div key={index}>{msg}</div>
              ))}
            </div>
          </div>
        </div>
          )}
        </>
       )}
    </div>
  );
}

export default App;