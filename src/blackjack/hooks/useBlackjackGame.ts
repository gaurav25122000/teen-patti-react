// src/blackjack/hooks/useBlackjackGame.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { BlackjackGameState, BlackjackPlayer, PlayerHand, HandStatus, GameStage, DealerHand } from '../types/blackjackGameTypes';
import { toTitleCase } from '../../utils/formatters';
import { bulkUpdateWinnings, type WinningsRecord } from '../../utils/winningsService';
import { SHA256 } from 'crypto-js';

const BLACKJACK_STORAGE_KEY = 'blackjackGameState';

const createInitialBlackjackState = (): BlackjackGameState => ({
    players: [],
    dealerHand: { cards: [], status: 'playing', score: 0 },
    gameStage: 'betting',
    messages: ["Welcome to the Blackjack Bets Manager! Set up a new game to begin."],
    currentPlayerId: null,
    currentHandId: null,
    minBet: 10,
    maxBet: 1000,
    allowSurrender: true,
    blackjackPayout: '3to2',
    dealerNet: 0, 
});

// Simplified card logic for manager (no deck, just scoring)
const getHandScore = (cards: string[]): number => {
    let score = 0;
    let aces = 0;
    for (const card of cards) {
        if (['K', 'Q', 'J', '10'].includes(card)) {
            score += 10;
        } else if (card === 'A') {
            aces += 1;
            score += 11;
        } else {
            score += parseInt(card);
        }
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
};

export const useBlackjackGame = () => {
    const [gameState, setGameState] = useState<BlackjackGameState>(createInitialBlackjackState);

    const addMessage = useCallback((message: string) => {
        setGameState(prev => ({
            ...prev,
            messages: [...prev.messages.slice(-100), message]
        }));
    }, []);

    const loadGame = useCallback(() => {
        const savedState = localStorage.getItem(BLACKJACK_STORAGE_KEY);
        if (!savedState) {
            addMessage("No saved game found.");
            return false;
        }
        try {
            const parsed = JSON.parse(savedState);
            // Ensure new properties are initialized
            const initialState = createInitialBlackjackState();
            setGameState({
                ...initialState,
                ...parsed,
                players: parsed.players.map((p: any) => ({ ...p, isTakingBreak: p.isTakingBreak || false })),
                dealerNet: parsed.dealerNet || 0,
            });
            return true;
        } catch {
            localStorage.removeItem(BLACKJACK_STORAGE_KEY);
            addMessage("Failed to load saved game, starting fresh.");
            return false;
        }
    }, [addMessage]);

    useEffect(() => {
        if (gameState.players.length > 0) {
            localStorage.setItem(BLACKJACK_STORAGE_KEY, JSON.stringify(gameState));
        }
    }, [gameState]);

    const setupGame = useCallback((players: { name: string, stack: number, phoneNumber: string, numHands: number }[]) => {
        const initialPlayers: BlackjackPlayer[] = players.map((p, i) => ({
            id: i + 1,
            name: toTitleCase(p.name),
            stack: p.stack,
            totalBuyIn: p.stack,
            phoneNumber: p.phoneNumber,
            initialHandsCount: p.numHands,
            hands: [],
            isTakingBreak: false,
        }));
        setGameState({
            ...createInitialBlackjackState(),
            players: initialPlayers,
            messages: [`Game setup with ${players.length} players. Click 'Show Bet Slips' to begin.`]
        });
    }, []);

    const placeBet = useCallback((playerId: number, handIndex: number, amount: number) => {
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only place bets before the deal.");
                return prev;
            }
            if (amount < prev.minBet || amount > prev.maxBet) {
                addMessage(`Bet must be between ${prev.minBet} and ${prev.maxBet}.`);
                return prev;
            }

            const newPlayers = prev.players.map(p => {
                if (p.id === playerId) {
                    if (p.stack < amount) {
                        addMessage(`${p.name} does not have enough chips.`);
                        return p;
                    }
                    const newHands = [...p.hands];
                    // Ensure the hand exists at the index
                    while(newHands.length <= handIndex) {
                        newHands.push({
                            id: `${p.id}-hand-${newHands.length}`,
                            cards: [],
                            bet: 0,
                            status: 'playing',
                            hasHit: false,
                        });
                    }
                    
                    newHands[handIndex] = {
                        ...newHands[handIndex],
                        id: `${p.id}-hand-${handIndex}`,
                        bet: amount,
                    };
                    return { ...p, hands: newHands, stack: p.stack - amount };
                }
                return p;
            });

            return { ...prev, players: newPlayers };
        });
    }, [addMessage]);

    const startRound = useCallback(() => {
        setGameState(prev => {
            let activePlayerFound = false;
            
            // 1. Create hands for players who don't have them yet
            const newPlayers = prev.players.map(p => {
                if (p.isTakingBreak || p.stack < prev.minBet) {
                    return { ...p, hands: [] }; // Clear hands if on break or no chips
                }
                
                let playerHasBet = false;
                let currentHands = p.hands;

                // If hands are empty, create them now so user can bet
                if (p.hands.length === 0 && p.initialHandsCount > 0) {
                    currentHands = Array(p.initialHandsCount).fill(null).map((_, i) => ({
                         id: `${p.id}-hand-${i}`,
                         cards: [],
                         bet: 0,
                         status: 'playing',
                         hasHit: false,
                    }));
                }
                
                // Check for any bets
                if (currentHands.some(h => h.bet > 0)) {
                    activePlayerFound = true;
                }
                
                return {...p, hands: currentHands};
            });
            
            // 2. If no bets are found, it means we just created the hands.
            //    Save the new hands to state and tell the user to bet.
            if (!activePlayerFound) {
                addMessage("Showing bet slips. Please place a bet for all active hands.");
                return { ...prev, players: newPlayers };
            }

            addMessage("--- NEW ROUND ---");
            addMessage("Dealing cards... (Please deal cards in real life)");
            
            // 3. If bets *are* found, proceed to start the round
            let firstPlayer: BlackjackPlayer | null = null;
            let firstHand: PlayerHand | null = null;

            for(const player of newPlayers) {
                if (player.isTakingBreak || player.hands.length === 0) continue;
                for (const hand of player.hands) {
                    if (hand.bet > 0) { // Only start with hands that have a bet
                        firstPlayer = player;
                        firstHand = hand;
                        break;
                    }
                }
                if(firstPlayer) break;
            }

            if (!firstPlayer || !firstHand) {
                addMessage("Please place a bet for at least one hand to start the round.");
                return {...prev, gameStage: 'betting', players: newPlayers};
            }

            return {
                ...prev,
                players: newPlayers.map(p => ({
                    ...p,
                    // Filter out any hands that didn't get a bet
                    hands: p.hands.filter(h => h.bet > 0).map(h => ({ ...h, status: 'playing', hasHit: false })) // Reset status
                })),
                dealerHand: { cards: ['?', '?'], status: 'playing', score: 0 }, // '?' as placeholder
                gameStage: 'player-turn',
                currentPlayerId: firstPlayer.id,
                currentHandId: firstHand.id,
                messages: [...prev.messages, `Player turn: ${toTitleCase(firstPlayer.name)}, Hand 1`]
            };
        });
    }, [addMessage]);
    
    const findNextHand = (players: BlackjackPlayer[], currentPlayerId: number, currentHandId: string): { nextPlayerId: number | null, nextHandId: string | null } => {
        const currentPlayerIndex = players.findIndex(p => p.id === currentPlayerId);
        if (currentPlayerIndex === -1) return { nextPlayerId: null, nextHandId: null };
        
        const currentPlayer = players[currentPlayerIndex];
        const currentHandIndex = currentPlayer.hands.findIndex(h => h.id === currentHandId);
        
        // 1. Check for more hands from the current player
        if (currentHandIndex !== -1 && currentHandIndex < currentPlayer.hands.length - 1) {
            for (let i = currentHandIndex + 1; i < currentPlayer.hands.length; i++) {
                if (currentPlayer.hands[i].status === 'playing') {
                    return { nextPlayerId: currentPlayerId, nextHandId: currentPlayer.hands[i].id };
                }
            }
        }
        
        // 2. Check for hands from subsequent players
        for (let i = currentPlayerIndex + 1; i < players.length; i++) {
            const nextPlayer = players[i];
            if (nextPlayer.isTakingBreak) continue;
            for (const hand of nextPlayer.hands) {
                if (hand.status === 'playing') {
                    return { nextPlayerId: nextPlayer.id, nextHandId: hand.id };
                }
            }
        }

        // 3. No more player hands, move to dealer
        return { nextPlayerId: null, nextHandId: null };
    };

    const handlePlayerAction = (action: 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance') => {
        setGameState(prev => {
            if (prev.gameStage !== 'player-turn' || !prev.currentPlayerId || !prev.currentHandId) return prev;

            let newPlayers = [...prev.players];
            const player = newPlayers.find(p => p.id === prev.currentPlayerId);
            if (!player) return prev;
            
            const hand = player.hands.find(h => h.id === prev.currentHandId);
            if (!hand || hand.status !== 'playing') return prev;

            let nextPlayerId = prev.currentPlayerId;
            let nextHandId = prev.currentHandId;
            let nextStage: GameStage = 'player-turn';

            const updateHand = (playerId: number, handId: string, updates: Partial<PlayerHand>) => {
                newPlayers = newPlayers.map(p => 
                    p.id === playerId ? {
                        ...p,
                        hands: p.hands.map(h => h.id === handId ? { ...h, ...updates } : h)
                    } : p
                );
            };
            
            const updatePlayer = (playerId: number, updates: Partial<BlackjackPlayer>) => {
                newPlayers = newPlayers.map(p =>
                    p.id === playerId ? { ...p, ...updates } : p
                );
            };

            switch(action) {
                case 'hit':
                    addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) hits.`);
                    updateHand(player.id, hand.id, { hasHit: true });
                    break;
                case 'stand':
                    addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) stands.`);
                    updateHand(player.id, hand.id, { status: 'stand' });
                    break;
                case 'double':
                    if (hand.hasHit) {
                        addMessage("Cannot double down after hitting.");
                        return prev;
                    }
                    if (player.stack < hand.bet) {
                        addMessage("Not enough stack to double down.");
                        return prev;
                    }
                    addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) doubles down.`);
                    updatePlayer(player.id, { stack: player.stack - hand.bet });
                    updateHand(player.id, hand.id, { bet: hand.bet * 2, status: 'stand' }); // Double = one card and stand
                    break;
                case 'surrender':
                    if (!prev.allowSurrender) {
                        addMessage("Surrender is not allowed.");
                        return prev;
                    }
                    if (hand.hasHit) {
                         addMessage("Cannot surrender after hitting.");
                         return prev;
                    }
                    addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) surrenders.`);
                    const refund = hand.bet / 2;
                    const lossAmount = hand.bet / 2; // This is what the dealer wins
                    updatePlayer(player.id, { stack: player.stack + refund });
                    updateHand(player.id, hand.id, { status: 'surrendered', bet: lossAmount }); // Store the loss amount
                    break;
                case 'insurance':
                     addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) takes insurance.`);
                     break;
            }
            
            // --- UPDATED LOGIC ---
            // Find the hand *after* updates
            const updatedHand = newPlayers.find(p => p.id === player.id)?.hands.find(h => h.id === hand.id);
            let newDealerNet = prev.dealerNet; 

            // FIX: If player surrendered, update dealer net immediately
            if (updatedHand && updatedHand.status === 'surrendered' && action === 'surrender') {
                newDealerNet += updatedHand.bet; // 'bet' was already halved to the loss amount
            }

            // If current hand's status changed, find next hand
            if (updatedHand && updatedHand.status !== 'playing') {
                 const { nextPlayerId: npId, nextHandId: nhId } = findNextHand(newPlayers, player.id, hand.id);
                 if (npId && nhId) {
                    nextPlayerId = npId;
                    nextHandId = nhId;
                    const nextPlayer = newPlayers.find(p => p.id === npId)!;
                    addMessage(`Turn is now on ${toTitleCase(nextPlayer.name)}, Hand #${Number(nhId.split('-').pop()) + 1}`);
                 } else {
                    // No more player hands, move to dealer
                    nextStage = 'dealer-turn';
                    nextPlayerId = null;
                    nextHandId = null;
                    addMessage("All players have acted. Dealer's turn.");
                 }
            }

            return { ...prev, players: newPlayers, gameStage: nextStage, currentPlayerId: nextPlayerId, currentHandId: nextHandId, dealerNet: newDealerNet }; 
            // --- END UPDATED LOGIC ---
        });
    };
    
    const setHandStatus = (playerId: number, handId: string, status: HandStatus, dealerScore: number = 0) => {
         setGameState(prev => {
            let playerWonAmount: number | null = null;
            let dealerNetChange = 0;
            let finalStatus = status;
            let handBet = 0;

            const newPlayers = prev.players.map(p => {
                if (p.id !== playerId) return p;
                
                const newHands = p.hands.map(h => {
                    if (h.id !== handId) return h;
                    handBet = h.bet;

                    if (status === 'blackjack') {
                        const payout = (prev.blackjackPayout === '3to2' ? h.bet * 1.5 : h.bet * 1.2);
                        playerWonAmount = h.bet + payout; // Return original bet + winnings
                        dealerNetChange = -payout; // Dealer loses 1.5x
                        finalStatus = 'blackjack';
                    } else if (status === 'win') {
                        playerWonAmount = h.bet + h.bet; // Return original bet + 1x bet
                        dealerNetChange = -h.bet; // Dealer loses 1x
                        finalStatus = 'win';
                    } else if (status === 'lose') {
                        playerWonAmount = 0; // Lose original bet
                        dealerNetChange = h.bet; // Dealer wins 1x
                        finalStatus = 'lose';
                    } else if (status === 'push') {
                        playerWonAmount = h.bet; // Refund original bet
                        dealerNetChange = 0; // No change
                        finalStatus = 'push';
                    } else if (status === 'busted') {
                        playerWonAmount = 0; // Lose original bet
                        dealerNetChange = h.bet; // Dealer wins 1x
                        finalStatus = 'busted';
                    }
                    
                    // --- UPDATED LOGIC ---
                    if (h.status === 'surrendered') {
                        playerWonAmount = 0; // Already refunded
                        dealerNetChange = 0; // FIX: Already handled in player-turn
                        finalStatus = 'surrendered';
                    }
                    // --- END UPDATED LOGIC ---

                    return { ...h, status: finalStatus };
                });
                
                let newStack = p.stack;
                if (playerWonAmount !== null) {
                    newStack += playerWonAmount;
                }

                return { ...p, hands: newHands, stack: newStack };
            });
            
            if (playerWonAmount !== null) {
                const player = prev.players.find(p => p.id === playerId)!;
                const handNum = Number(handId.split('-').pop()) + 1;
                
                if (finalStatus === 'blackjack') addMessage(`${player.name} (Hand ${handNum}) has BLACKJACK! Wins ₹${playerWonAmount! - handBet}`);
                else if (finalStatus === 'win') addMessage(`${player.name} (Hand ${handNum}) wins ₹${playerWonAmount! - handBet}`);
                else if (finalStatus === 'push') addMessage(`${player.name} (Hand ${handNum}) pushes.`);
                else if (finalStatus === 'lose') addMessage(`${player.name} (Hand ${handNum}) loses ₹${handBet}`);
                else if (finalStatus === 'busted') addMessage(`${player.name} (Hand ${handNum}) busted and loses ₹${handBet}`);
                else if (finalStatus === 'surrendered') addMessage(`${player.name} (Hand ${handNum}) surrendered and loses ₹${handBet}`);

            }

            return { ...prev, players: newPlayers, dealerNet: prev.dealerNet + dealerNetChange };
         });
    };

    const endRoundAndPay = () => {
        setGameState(prev => {
            const recordsToUpdate: WinningsRecord[] = [];
            const timestamp = new Date().toISOString();
            
            const finalPlayers = prev.players.map(p => {
                let roundNet = 0;
                p.hands.forEach(h => {
                    if (h.status === 'win') roundNet += h.bet;
                    else if (h.status === 'blackjack') roundNet += (prev.blackjackPayout === '3to2' ? h.bet * 1.5 : h.bet * 1.2);
                    else if (h.status === 'lose') roundNet -= h.bet;
                    else if (h.status === 'busted') roundNet -= h.bet;
                    else if (h.status === 'surrendered') roundNet -= h.bet; // Bet was already halved, so this is the loss
                    // Push is net 0
                });

                if (p.phoneNumber && roundNet !== 0) {
                    recordsToUpdate.push({
                        phoneHash: SHA256(p.phoneNumber).toString(),
                        playerName: p.name,
                        gameType: 'blackjack',
                        winnings: roundNet,
                        timestamp
                    });
                }
                
                // Reset hands for next round
                return { ...p, hands: [] };
            });

            if(recordsToUpdate.length > 0) {
                bulkUpdateWinnings(recordsToUpdate);
            }
            
            addMessage("--- ROUND OVER ---");
            addMessage("All bets settled. Click 'Show Bet Slips' for the next round.");

            return {
                ...prev,
                players: finalPlayers,
                gameStage: 'betting',
                currentPlayerId: null,
                currentHandId: null,
                dealerHand: { cards: [], status: 'playing', score: 0 }
            };
        });
    };
    
    // --- PLAYER MANAGEMENT ACTIONS ---
    
    const addPlayer = useCallback((name: string, stack: number, phoneNumber: string, numHands: number) => {
        if (!name || stack < 0 || numHands < 1) return;
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only add players between rounds.");
                return prev;
            }
            const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
            const newPlayer: BlackjackPlayer = {
                id: newId,
                name: toTitleCase(name),
                stack,
                totalBuyIn: stack,
                phoneNumber,
                initialHandsCount: numHands,
                hands: [],
                isTakingBreak: false, 
            };
            addMessage(`Player ${toTitleCase(name)} has been added with a buy-in of ₹${stack}.`);
            return { ...prev, players: [...prev.players, newPlayer] };
        });
    }, [addMessage]);

    const removePlayer = useCallback((playerId: number) => {
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only remove players between rounds.");
                return prev;
            }
            const playerToRemove = prev.players.find(p => p.id === playerId);
            if (playerToRemove) {
                addMessage(`Player ${toTitleCase(playerToRemove.name)} has been removed.`);
            }
            return { ...prev, players: prev.players.filter(p => p.id !== playerId) };
        });
    }, [addMessage]);

    const addChipsToPlayer = useCallback((playerId: number, amount: number) => {
        if (amount <= 0) return;
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only add chips between rounds.");
                return prev;
            }
            const newPlayers = prev.players.map(p => {
                if (p.id === playerId) {
                    addMessage(`Added ₹${amount} to ${toTitleCase(p.name)}'s stack. Total buy-in: ₹${p.totalBuyIn + amount}.`);
                    return {
                        ...p,
                        stack: p.stack + amount,
                        totalBuyIn: p.totalBuyIn + amount
                    };
                }
                return p;
            });
            return { ...prev, players: newPlayers };
        });
    }, [addMessage]);

    const togglePlayerBreak = useCallback((playerId: number) => {
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only take a break between rounds.");
                return prev;
            }
            const newPlayers = prev.players.map(p =>
                p.id === playerId ? { ...p, isTakingBreak: !p.isTakingBreak } : p
            );
            const player = prev.players.find(p => p.id === playerId);
            if (player) {
                addMessage(`${toTitleCase(player.name)} is now ${!player.isTakingBreak ? 'on a break' : 'back'}.`);
            }
            return { ...prev, players: newPlayers };
        });
    }, [addMessage]);
    
    const updatePlayerHandCount = useCallback((playerId: number, numHands: number) => {
         if (numHands < 1) return;
         setGameState(prev => {
             if (prev.gameStage !== 'betting') {
                addMessage("Can only change hand count between rounds.");
                return prev;
            }
             const newPlayers = prev.players.map(p =>
                p.id === playerId ? { ...p, initialHandsCount: numHands } : p
            );
            const player = prev.players.find(p => p.id === playerId);
            if (player) {
                 addMessage(`${toTitleCase(player.name)} will now play ${numHands} hand(s) per round.`);
            }
            return { ...prev, players: newPlayers };
         });
    }, [addMessage]);


    const actions = useMemo(() => ({
        setupGame,
        loadGame,
        placeBet,
        startRound,
        handlePlayerAction,
        setHandStatus,
        endRoundAndPay,
        addPlayer,
        removePlayer,
        addChipsToPlayer,
        togglePlayerBreak,
        updatePlayerHandCount,
    }), [setupGame, loadGame, placeBet, startRound, handlePlayerAction, setHandStatus, endRoundAndPay,
         addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, updatePlayerHandCount]);

    return { gameState, actions };
};