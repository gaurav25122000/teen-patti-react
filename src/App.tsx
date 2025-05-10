import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import type { Player, GameState } from './types';

const LOCAL_STORAGE_KEY = 'teenPattiGameState';

function App() { // Assuming GameState type is defined above or imported
  const [gameState, setGameState] = useState<GameState>(() => {
    // Load initial state from localStorage or set defaults
    console.log("Attempting to load state from localStorage..."); // Debug log
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        console.log("Successfully parsed saved state:", parsed); // Debug log
        // Need to parse Set from array
        return {
            ...parsed,
            foldedPlayerIds: new Set(parsed.foldedPlayerIds || []),
            lastBootAmount: parsed.lastBootAmount || null, // Load last boot amount
            blindPlayerIds: new Set(parsed.blindPlayerIds || []), // Load blind players
            lastActorWasBlind: parsed.lastActorWasBlind || false, // Load last actor status
            roundInitialBootAmount: parsed.roundInitialBootAmount || null, // Load initial boot for current round if saved mid-round
        };
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
      lastBootAmount: null, // Initialize last boot amount
      blindPlayerIds: new Set<number>(), // Initialize blind players set
      lastActorWasBlind: false, // Initialize last actor status
      roundInitialBootAmount: null, // Initialize the boot amount for the current round
      messages: ["Welcome! Load a game or set up a new one."],
    };
  });

  const [showSetup, setShowSetup] = useState(gameState.players.length < 2);
  const [numPlayersInput, setNumPlayersInput] = useState("2");
  const [playerInputs, setPlayerInputs] = useState<{ name: string; balance: string }[]>([]);
  const [betAmountInput, setBetAmountInput] = useState("");
  const [blindRaiseAmountInput, setBlindRaiseAmountInput] = useState("");

  // State for inline forms/modals replacement
  const [interactionState, setInteractionState] = useState<'idle' | 'gettingBoot' | 'gettingStartPlayer' | 'addingPlayer' | 'removingPlayer' | 'selectingWinner' | 'showingCards'>('idle');
  const [bootAmountInput, setBootAmountInput] = useState("10");
  const [addPlayerNameInput, setAddPlayerNameInput] = useState("");
  const [addPlayerBalanceInput, setAddPlayerBalanceInput] = useState("0");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(""); // For selections (start, remove, win)
  const [showPrecedingPlayerId, setShowPrecedingPlayerId] = useState<number | null>(null); // Store the ID of the player being shown against

  // Ref for the action log container
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- Utility Functions (Core, no complex dependencies or for early use) ---
  const toTitleCase = (str: string): string => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // --- Primary Derived State Calculation Functions (depend only on gameState) ---
  const getCurrentPlayer = useCallback((): Player | null => {
    if (!gameState.roundActive || gameState.currentPlayerIndex < 0 || gameState.currentPlayerIndex >= gameState.players.length) {
      return null;
    }
    return gameState.players[gameState.currentPlayerIndex];
  }, [gameState.roundActive, gameState.currentPlayerIndex, gameState.players]);

  const getActivePlayers = useCallback((): Player[] => {
    return gameState.players.filter(p => !gameState.foldedPlayerIds.has(p.id));
  }, [gameState.players, gameState.foldedPlayerIds]);

  // --- Derived State Values (calculated on every render) ---
  // These are now defined before the useEffects that use them.
  const currentPlayer = getCurrentPlayer();
  const activePlayers = getActivePlayers();

  // --- Secondary Utility Functions (may depend on derived state like currentPlayer) ---
  const findPrecedingActivePlayer = useCallback((): Player | null => {
    const numPlayers = gameState.players.length;
    if (numPlayers < 2 || !currentPlayer) return null; // Uses currentPlayer

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
  }, [gameState.players, gameState.currentPlayerIndex, gameState.foldedPlayerIds, currentPlayer]);

  // --- Persistence ---
  useEffect(() => {
    // Save state to localStorage whenever it changes
    // Convert Set to array for JSON serialization
    const stateToSave = {
      ...gameState,
      foldedPlayerIds: Array.from(gameState.foldedPlayerIds),
      blindPlayerIds: Array.from(gameState.blindPlayerIds), // Serialize blindPlayerIds
      // lastActorWasBlind is already serializable
      // lastBootAmount is already serializable
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [gameState]);

  // Effect to auto-fill bet amount input and blind raise input
  useEffect(() => {
    if (gameState.roundActive && currentPlayer) {
        if (gameState.blindPlayerIds.has(currentPlayer.id)) {
            // Player is blind
            setBetAmountInput(String(gameState.currentStake));
            setBlindRaiseAmountInput(String(gameState.currentStake * 2)); // Suggest double for raise
        } else { // Player is Chaal (Seen)
            const minChaalBet = gameState.lastActorWasBlind
                ? 2 * gameState.currentStake
                : gameState.currentStake;
            setBetAmountInput(String(minChaalBet));
            setBlindRaiseAmountInput(""); // Clear if not blind player's turn
        }
    } else if (!gameState.roundActive) {
        setBetAmountInput(""); // Clear if round is not active
        setBlindRaiseAmountInput(""); // Clear if round is not active
    }
  }, [gameState.roundActive, gameState.currentPlayerIndex, gameState.currentStake, gameState.blindPlayerIds, gameState.lastActorWasBlind, currentPlayer]);


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
      lastWinnerId: null,       // Reset winner for a new game
      roundActive: false,       // Ensure round is not active yet
      currentPlayerIndex: -1,   // No player selected initially
      currentStake: 0,          // Reset stake
      potAmount: 0,             // Reset pot
      foldedPlayerIds: new Set<number>(), // Reset folded players
      lastBootAmount: null,     // Reset last boot amount
      messages: [`New game started with ${newPlayers.length} players. Please set the boot amount.`]
    }));
    setShowSetup(false);
    setBootAmountInput("10"); // Reset boot input to default
    setInteractionState('gettingBoot'); // Immediately ask for boot amount
  };

  const handleLoadGame = () => {
     const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
     if (savedState) {
       const parsed = JSON.parse(savedState);
       if (parsed.players && parsed.players.length >= 2) {
         setGameState({
            ...parsed,
            foldedPlayerIds: new Set(parsed.foldedPlayerIds || []),
            lastBootAmount: parsed.lastBootAmount || null // Ensure lastBootAmount is loaded
         });
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
      lastBootAmount: prev.roundInitialBootAmount, // Store the actual boot amount that started this round
      roundInitialBootAmount: null, // Reset for the next round
      blindPlayerIds: new Set<number>(), // Reset blind players
      lastActorWasBlind: false, // Reset last actor status
      };
    });
  }, []);

  const handleStartRound = () => {
    if (gameState.players.length < 2) {
      alert("Need at least 2 players.");
      return;
    }

    // If a previous round was played and we have a last boot amount, start directly
    if (gameState.lastWinnerId !== null && gameState.lastBootAmount && gameState.lastBootAmount > 0) {
      const winnerIndex = gameState.players.findIndex(p => p.id === gameState.lastWinnerId);
      if (winnerIndex !== -1) {
        const startingPlayerIndex = (winnerIndex + 1) % gameState.players.length;
        addMessage(`Starting round with previous boot: Rs. ${gameState.lastBootAmount}.`);
        startRoundWithPlayer(startingPlayerIndex, gameState.lastBootAmount);
      } else {
        // Should not happen if lastWinnerId is valid, but handle defensively
        addMessage("Error finding last winner. Please set boot amount manually.", true);
        setInteractionState('gettingBoot');
      }
    } else {
      // Otherwise (first round after loading, or no last boot amount), prompt for boot
      addMessage("Please set the boot amount for this round.");
      setBootAmountInput(String(gameState.lastBootAmount || 10)); // Suggest last boot or default
      setInteractionState('gettingBoot');
    }

  };

  // Called after user enters boot amount
  const handleConfirmBootAmount = () => {
    const bootAmount = parseInt(bootAmountInput);
    if (isNaN(bootAmount) || bootAmount <= 0) {
      alert("Invalid boot amount. Must be a positive number.");
      return;
    }

    let startingPlayerIndex = -1;

    // Determine starting player
    if (gameState.lastWinnerId !== null) {
      const winnerIndex = gameState.players.findIndex(p => p.id === gameState.lastWinnerId);
      if (winnerIndex !== -1) {
        startingPlayerIndex = (winnerIndex + 1) % gameState.players.length;
      }
    }

    if (startingPlayerIndex === -1) { // No last winner (first game) or error finding winner
      // Need to select starting player manually
      setSelectedPlayerId(gameState.players.length > 0 ? String(gameState.players[0].id) : ""); // Default selection
      setInteractionState('gettingStartPlayer');
      // Store boot amount temporarily before proceeding
      setGameState(prev => ({ ...prev, currentStake: bootAmount })); // Use currentStake temporarily
      return;
    } else { // Starting player determined automatically
      startRoundWithPlayer(startingPlayerIndex, bootAmount); } };

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
        const initialBlindPlayerIds = new Set(updatedPlayers.map(p => p.id)); // All players start blind

        addMessage(`Collecting Boot Amount: Rs. ${bootAmount} from each player. Pot: Rs. ${newPot}`);
        return {
            ...prev,
            players: updatedPlayers,
            roundActive: true,
            blindPlayerIds: initialBlindPlayerIds,
            currentPlayerIndex: startingPlayerIndex,
            currentStake: bootAmount,
            potAmount: newPot,
            foldedPlayerIds: new Set<number>(),
            lastActorWasBlind: true, // Boot collection acts as a universal blind bet
            roundInitialBootAmount: bootAmount, // Store the boot amount for this round
            messages: [...prev.messages, `Round started. Stake: Rs. ${bootAmount}. Turn: ${toTitleCase(updatedPlayers[startingPlayerIndex].name)}`],
        };
    });
    setInteractionState('idle'); // Back to normal game state
  };

  // Handler for the new "Change Boot" button
  const handleChangeBoot = () => {
    if (gameState.roundActive) return; // Should be disabled anyway
    addMessage("Changing boot amount for the next round.");
    setBootAmountInput(String(gameState.lastBootAmount || 10)); // Pre-fill with last boot or default
    setInteractionState('gettingBoot');
  };

  const handlePlayStandardBlind = () => {
    const player = getCurrentPlayer();
    if (!player || !gameState.blindPlayerIds.has(player.id)) {
        addMessage("Error: Only blind players can play a standard blind.", true);
        return;
    }

    const actualBetAmount = gameState.currentStake;
    // Assuming player has enough balance or allowing negative balance as per current logic
    // if (player.balance < actualBetAmount) {
    //     addMessage(`${toTitleCase(player.name)} does not have enough balance to bet Rs. ${actualBetAmount}.`, true);
    //     return;
    // }

    setGameState(prev => {
        if (!player) return prev; // Should be caught, for type safety
        const updatedPlayers = prev.players.map(p =>
            p.id === player.id ? { ...p, balance: p.balance - actualBetAmount } : p
        );

        return {
            ...prev,
            players: updatedPlayers,
            potAmount: prev.potAmount + actualBetAmount,
            // currentStake does NOT change for a standard blind play
            lastActorWasBlind: true, // This action was a blind play
            messages: [...prev.messages, `${toTitleCase(player.name)} plays blind for Rs. ${actualBetAmount}.`],
        };
    });
    advanceTurn();
  };

  const handleConfirmBlindRaise = () => {
    const player = getCurrentPlayer();
    if (!player || !gameState.blindPlayerIds.has(player.id)) {
        addMessage("Error: Only blind players can raise blind.", true);
        return;
    }

    const raiseAmount = parseInt(blindRaiseAmountInput);

    if (isNaN(raiseAmount)) {
        alert("Invalid raise amount.");
        return;
    }
    if (raiseAmount <= gameState.currentStake) {
        alert(`Blind raise must be greater than the current stake of Rs. ${gameState.currentStake}.`);
        return;
    }
    // Balance check (currently commented out elsewhere too)
    // if (player.balance < raiseAmount) { ... }

    setGameState(prev => {
        if (!player) return prev;
        const updatedPlayers = prev.players.map(p =>
            p.id === player.id ? { ...p, balance: p.balance - raiseAmount } : p
        );
        return {
            ...prev,
            players: updatedPlayers,
            potAmount: prev.potAmount + raiseAmount,
            currentStake: raiseAmount, // The raise amount becomes the new current stake
            lastActorWasBlind: true, // This action was a blind play
            messages: [...prev.messages, `${toTitleCase(player.name)} raises blind to Rs. ${raiseAmount}.`],
        };
    });
    advanceTurn();
  };

  const handleSeeCards = () => {
    const player = getCurrentPlayer();
    if (!player || !gameState.blindPlayerIds.has(player.id)) {
        addMessage("Error: Only blind players can 'See Cards'.", true);
        return;
    }

    setGameState(prev => {
        const newBlindPlayerIds = new Set(prev.blindPlayerIds);
        newBlindPlayerIds.delete(player.id);
        // Player's turn does not advance yet. They must now make a Chaal move.
        // lastActorWasBlind remains as it was, as no bet/action affecting next player's min bet has occurred.
        return {
            ...prev,
            blindPlayerIds: newBlindPlayerIds,
            messages: [...prev.messages, `${toTitleCase(player.name)} sees their cards. Must now play Chaal, Show, or Fold.`],
        };
    });
    // useEffect for betAmountInput will update the input field for Chaal play.
  };

   const handleBet = () => {
      const player = getCurrentPlayer();
      if (!player || gameState.blindPlayerIds.has(player.id)) {
          addMessage("Error: Seen players use 'Bet/Chaal'. Blind players use 'Play Blind' or 'See Cards' first.", true);
          return;
      }

      const betAmount = parseInt(betAmountInput);

      if (isNaN(betAmount)) {
          alert("Invalid bet amount.");
          return;
      }

      if (betAmount === 0) { // Treat 0 bet as fold
          handleFold();
          return;
      }

      const minChaalBet = gameState.lastActorWasBlind
          ? 2 * gameState.currentStake
          : gameState.currentStake;

      if (betAmount < minChaalBet) {
          alert(`Bet must be at least Rs. ${minChaalBet}.`);
          return;
      }

      // Removed the check for player.balance < betAmount to allow negative balances

      // Process bet
      setGameState(prev => {
          if (!player) return prev; // Should be caught earlier, but for type safety
          const newPlayers = prev.players.map(p =>
              p.id === player.id ? { ...p, balance: p.balance - betAmount } : p
          );

          let newCalculatedStake = prev.currentStake;
          let stakeMessage = "";

          if (prev.lastActorWasBlind) { // Previous was blind, current is Chaal
              const potentialNewStake = Math.floor(betAmount / 2);
              if (potentialNewStake > prev.currentStake) {
                  newCalculatedStake = potentialNewStake;
              }
          } else { // Previous was Chaal, current is Chaal
              if (betAmount > prev.currentStake) {
                  newCalculatedStake = betAmount;
              }
          }
          // Ensure stake doesn't go below initial boot amount for the round
          const finalNewStake = Math.max(newCalculatedStake, prev.roundInitialBootAmount || 0);

          if (finalNewStake > prev.currentStake) {
              stakeMessage = ` Stake (for blind) updated to Rs. ${finalNewStake}.`;
          }
          let messages = [...prev.messages, `${toTitleCase(player.name)} bets Rs. ${betAmount}.${stakeMessage}`];

          return {
              ...prev,
              players: newPlayers,
              potAmount: prev.potAmount + betAmount,
              currentStake: finalNewStake,
              lastActorWasBlind: false, // This action was a Chaal play
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
  const calculateShowCost = useCallback((): number => {
    if (!currentPlayer || !gameState.roundActive) return 0;
    const precedingPlayer = findPrecedingActivePlayer();
    if (!precedingPlayer) return 0;

    const isRequesterBlind = gameState.blindPlayerIds.has(currentPlayer.id);
    const isTargetBlind = gameState.blindPlayerIds.has(precedingPlayer.id);

    if (isRequesterBlind) { // Blind player initiating show
        return gameState.currentStake;
    } else { // Chaal (Seen) player initiating show
        if (isTargetBlind) { // Chaal showing against Blind
            return 2 * gameState.currentStake;
        } else { // Chaal showing against Chaal
            return gameState.currentStake;
        }
    }
}, [currentPlayer, gameState.roundActive, gameState.blindPlayerIds, gameState.currentStake, findPrecedingActivePlayer]);

  const handleShow = () => {
      if (!currentPlayer || !gameState.roundActive) return;

      const precedingPlayer = findPrecedingActivePlayer();

      if (!precedingPlayer) {
          alert("Cannot Show: No preceding active player found.");
          return;
      }

      const showCost = calculateShowCost();
      if (showCost === 0 && precedingPlayer) { // calculateShowCost might return 0 if precedingPlayer is null but we checked earlier
          addMessage("Error calculating show cost.", true);
          return;
      }
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
                  if (gameState.roundActive && !isFolded) {
                      if (gameState.blindPlayerIds.has(p.id)) {
                          status = "Blind";
                      } else {
                          status = "Seen (Chaal)";
                      }
                      if (isCurrent) status += " (Current Turn)";
                  } else if (isFolded) {
                      status = "Folded";
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
              <button
                className="btn-primary"
                onClick={handleStartRound}
                disabled={gameState.roundActive || gameState.players.length < 2 || !gameState.lastBootAmount || gameState.lastWinnerId === null}
                title={!gameState.lastBootAmount || gameState.lastWinnerId === null ? "Play one round first to use the same boot amount" : "Start next round with the same boot amount"}
              >Start New Round</button>
              <button className="btn-secondary" onClick={handleChangeBoot} disabled={gameState.roundActive || gameState.players.length < 2}>Change Boot</button>
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
                 {gameState.blindPlayerIds.has(currentPlayer.id) ? (
                    <>
                        <button onClick={handlePlayStandardBlind} className="btn-action">
                            Play Blind (Cost: Rs. {gameState.currentStake})
                        </button>
                        <div className="inline-input-group">
                            <input
                                type="number"
                                value={blindRaiseAmountInput}
                                onChange={(e) => setBlindRaiseAmountInput(e.target.value)}
                                placeholder={`Min Raise: ${gameState.currentStake + 1}`}
                                min={gameState.currentStake + 1}
                            />
                            <button onClick={handleConfirmBlindRaise} className="btn-action">Raise Blind</button>
                        </div>
                        <button onClick={handleSeeCards} className="btn-action">
                            See Cards
                        </button>
                    </>
                 ) : (
                    <>
                        <input
                            type="number"
                            placeholder="Bet Amount"
                            value={betAmountInput}
                            onChange={(e) => setBetAmountInput(e.target.value)}
                            min="0" // Dynamic min enforced in handleBet
                        />
                        <button onClick={handleBet} className="btn-bet">
                            Bet / Chaal
                        </button>
                    </>
                 )}
                 <button onClick={handleFold} className="btn-fold">Fold (0)</button>
                 <button onClick={handleShow} className="btn-show">Show (Cost: Rs. {calculateShowCost()})</button>
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