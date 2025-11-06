// teen-patti-react/src/blackjack/hooks/useBlackjackGame.ts
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
    isBettingLocked: true, 
});

// --- HELPER FUNCTION ---
const loadStateFromStorage = (): BlackjackGameState | null => {
    try {
        const savedState = localStorage.getItem(BLACKJACK_STORAGE_KEY);
        if (!savedState) {
            return null;
        }
        
        const parsed = JSON.parse(savedState);
        if (!parsed || !parsed.players) {
            return null;
        }

        const initialState = createInitialBlackjackState();
        return {
            ...initialState,
            ...parsed,
            players: parsed.players.map((p: any) => ({ 
                ...p, 
                isTakingBreak: p.isTakingBreak || false,
                // --- FIX: Handle loading old state vs new state ---
                lastBets: p.lastBets || (p.lastBet ? [p.lastBet] : [initialState.minBet]),
                lastBet: undefined, // Remove old property
                // --- FIX: Ensure wager is initialized ---
                hands: p.hands.map((h: any) => ({
                    ...h,
                    wager: h.wager || h.bet || 0
                }))
            })),
            dealerNet: parsed.dealerNet || 0,
            isBettingLocked: parsed.isBettingLocked !== undefined ? parsed.isBettingLocked : true,
        };
    } catch {
        localStorage.removeItem(BLACKJACK_STORAGE_KEY);
        return null;
    }
};

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

// --- HELPER TO CHECK FOR AUTO-SETTLE ---
const areAllHandsSettled = (players: BlackjackPlayer[]): boolean => {
    for (const player of players) {
        if (player.isTakingBreak) continue;
        for (const hand of player.hands) {
            if (hand.status === 'playing' || hand.status === 'stand') {
                return false; // Found a hand that still needs settlement
            }
        }
    }
    return true; // All active hands are settled
};

export const useBlackjackGame = () => {
    const [gameState, setGameState] = useState<BlackjackGameState>(() => {
        return loadStateFromStorage() || createInitialBlackjackState();
    });

    const addMessage = useCallback((message: string) => {
        setGameState(prev => ({
            ...prev,
            messages: [...prev.messages.slice(-100), message]
        }));
    }, []);

    const loadGame = useCallback(() => {
        const loadedState = loadStateFromStorage();
        if (loadedState) {
            setGameState(loadedState);
            addMessage("Saved game loaded.");
            return true;
        } else {
            addMessage("No saved game found.");
            return false;
        }
    }, [addMessage]);

    useEffect(() => {
        if (gameState.players.length > 0) {
            localStorage.setItem(BLACKJACK_STORAGE_KEY, JSON.stringify(gameState));
        } else {
            // --- ADDED: Clear storage if game is reset ---
            localStorage.removeItem(BLACKJACK_STORAGE_KEY);
        }
    }, [gameState]);

    // --- ADDED: Action to reset game ---
    const setupNewGame = useCallback(() => {
        setGameState(createInitialBlackjackState());
    }, []);

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
            lastBets: Array(p.numHands).fill(createInitialBlackjackState().minBet), // UPDATED
        }));
        setGameState({
            ...createInitialBlackjackState(),
            players: initialPlayers,
            messages: [`Game setup with ${players.length} players. Bets are locked to ₹${createInitialBlackjackState().minBet}. Click 'Deal Cards' to play or 'Change Bets' to unlock.`]
        });
    }, []);

    const placeBet = useCallback((playerId: number, handIndex: number, amount: number) => {
        setGameState(prev => {
            if (prev.gameStage !== 'betting') {
                addMessage("Can only place bets before the deal.");
                return prev;
            }
            if (prev.isBettingLocked) {
                addMessage("Bets are locked. Click 'Change Bets' to unlock.");
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
                    if (!newHands[handIndex]) {
                         newHands[handIndex] = {
                            id: `${p.id}-hand-${handIndex}`,
                            cards: [],
                            bet: 0,
                            wager: 0, // ADDED
                            status: 'playing',
                            hasHit: false,
                        };
                    }
                    
                    newHands[handIndex] = {
                        ...newHands[handIndex],
                        bet: amount,
                        wager: amount, // ADDED
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
            let totalHands = 0;
            let handsWithBets = 0;
            
            const newPlayers = prev.players.map(p => {
                // --- FIX: Check stack against *sum* of last bets ---
                const totalLastBet = p.lastBets.slice(0, p.initialHandsCount).reduce((a, b) => a + b, 0);
                if (p.isTakingBreak || p.stack < (prev.isBettingLocked ? totalLastBet : prev.minBet)) {
                    if (p.isTakingBreak) addMessage(`${p.name} is on break.`);
                    else addMessage(`${p.name} has insufficient chips to play.`);
                    return { ...p, hands: [] }; // Clear hands
                }
                
                let currentHands = p.hands;

                // Create hands if they don't exist
                if (p.hands.length === 0) {
                     currentHands = Array(p.initialHandsCount).fill(null).map((_, i) => ({
                         id: `${p.id}-hand-${i}`,
                         cards: [],
                         bet: 0,
                         wager: 0, // ADDED
                         status: 'playing',
                         hasHit: false,
                    }));
                }
                
                // If betting is locked, auto-place bets
                if (prev.isBettingLocked) {
                    let playerStack = p.stack;
                    currentHands = currentHands.map((h, i) => {
                        // --- FIX: Use the specific bet for this hand index ---
                        const betAmount = p.lastBets[i] || p.lastBets[0] || prev.minBet;
                        if (playerStack >= betAmount) {
                            playerStack -= betAmount;
                            activePlayerFound = true;
                            handsWithBets++;
                            return { ...h, bet: betAmount, wager: betAmount }; // UPDATED
                        }
                        return { ...h, bet: 0, wager: 0 }; // Not enough stack for this hand
                    });
                    totalHands += currentHands.length;
                    return { ...p, hands: currentHands, stack: playerStack };
                } else {
                    // Betting is unlocked, just check if bets are placed
                    totalHands += currentHands.length;
                    currentHands.forEach(h => {
                        if (h.bet > 0) {
                            activePlayerFound = true;
                            handsWithBets++;
                        }
                    });
                    return { ...p, hands: currentHands };
                }
            });
            
            // --- Logic for different states ---
            
            // 1. Betting is locked: Auto-bet and start
            if (prev.isBettingLocked) {
                if (!activePlayerFound) {
                    addMessage("No players had enough chips to auto-bet. Round not started.");
                    return { ...prev, players: newPlayers }; // Show players with empty hands
                }
                addMessage(`--- NEW ROUND ---`);
                addMessage(`Auto-betting ${handsWithBets} hand(s) with last used bet.`);
            } 
            // 2. Betting is unlocked: Check if all hands have bets
            else {
                if (!activePlayerFound) {
                    addMessage("Please place a bet for at least one hand to start.");
                    return { ...prev, players: newPlayers };
                }
                if (handsWithBets < totalHands) {
                    addMessage(`Please place bets for all ${totalHands} active hands.`);
                    return { ...prev, players: newPlayers };
                }
                
                addMessage(`--- NEW ROUND ---`);
                addMessage(`Locking ${handsWithBets} hand(s). Dealing cards...`);
            }

            // --- Find first player and start ---
            let firstPlayer: BlackjackPlayer | null = null;
            let firstHand: PlayerHand | null = null;
            for(const player of newPlayers) {
                if (player.isTakingBreak || player.hands.length === 0) continue;
                for (const hand of player.hands) {
                    if (hand.bet > 0) { 
                        firstPlayer = player;
                        firstHand = hand;
                        break;
                    }
                }
                if(firstPlayer) break;
            }

            if (!firstPlayer || !firstHand) {
                addMessage("An unexpected error occurred. No valid hands found.");
                return prev;
            }

            return {
                ...prev,
                players: newPlayers.map(p => ({
                    ...p,
                    hands: p.hands.filter(h => h.bet > 0).map(h => ({ ...h, status: 'playing', hasHit: false }))
                })),
                dealerHand: { cards: ['?', '?'], status: 'playing', score: 0 },
                gameStage: 'player-turn',
                currentPlayerId: firstPlayer.id,
                currentHandId: firstHand.id,
                isBettingLocked: true, // Lock betting on round start
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

    // This function must be defined *before* it is used in setHandStatus
    const endRoundAndPay_internal = (state: BlackjackGameState): BlackjackGameState => {
        const endState = state || gameState;

        const recordsToUpdate: WinningsRecord[] = [];
        const timestamp = new Date().toISOString();
        
        const finalPlayers = endState.players.map(p => {
            let roundNet = 0;
            // --- FIX: Store bets by index ---
            const newLastBetsMap = new Map<number, number>();
            
            p.hands.forEach((h, i) => {
                // --- FIX: Save the ORIGINAL bet (h.bet) ---
                if (h.bet > 0) {
                    newLastBetsMap.set(i, h.bet);
                }
                
                // --- FIX: Calculate winnings based on correct properties ---
                if (h.status === 'win') roundNet += h.wager;
                else if (h.status === 'blackjack') roundNet += (endState.blackjackPayout === '3to2' ? h.bet * 1.5 : h.bet * 1.2); // BJ pays on original bet
                else if (h.status === 'lose') roundNet -= h.wager;
                else if (h.status === 'busted') roundNet -= h.wager;
                else if (h.status === 'surrendered') roundNet -= h.bet / 2; // Surrender loss is half *original* bet
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
            
            // --- FIX: Merge new bets with old bets ---
            const finalLastBets = p.lastBets.map((oldBet, i) => newLastBetsMap.get(i) || oldBet);

            // Reset hands for next round
            return { ...p, hands: [], lastBets: finalLastBets };
        });

        if(recordsToUpdate.length > 0) {
            bulkUpdateWinnings(recordsToUpdate);
        }

        return {
            ...endState, // Use the state passed in
            players: finalPlayers,
            gameStage: 'betting',
            currentPlayerId: null,
            currentHandId: null,
            dealerHand: { cards: [], status: 'playing', score: 0 },
            isBettingLocked: true, // Lock betting for next round
            messages: [...endState.messages, "--- ROUND OVER ---", `Bets locked to last amount. Click 'Change Bets' to unlock.`]
        };
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
            let newDealerNet = prev.dealerNet; 

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
                    if (player.stack < hand.bet) { // --- FIX: Check against original bet ---
                        addMessage("Not enough stack to double down.");
                        return prev;
                    }
                    addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) doubles down.`);
                    updatePlayer(player.id, { stack: player.stack - hand.bet }); // --- FIX: Subtract original bet ---
                    updateHand(player.id, hand.id, { wager: hand.bet * 2, status: 'stand' }); // --- FIX: Update wager, not bet ---
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
                    const refund = hand.bet / 2; // --- FIX: Based on original bet ---
                    const lossAmount = hand.bet / 2; // --- FIX: Based on original bet ---
                    updatePlayer(player.id, { stack: player.stack + refund });
                    updateHand(player.id, hand.id, { status: 'surrendered' }); // --- FIX: Don't change bet/wager ---
                    newDealerNet += lossAmount;
                    break;
                case 'insurance':
                     addMessage(`${player.name} (Hand ${Number(hand.id.split('-').pop()) + 1}) takes insurance.`);
                     break;
            }
            
            const updatedHand = newPlayers.find(p => p.id === player.id)?.hands.find(h => h.id === hand.id);

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
                    addMessage("All players have acted. Dealer's turn. Settle all hands.");
                    
                    // --- FIX: CHECK FOR AUTO-SETTLE ---
                    // If all hands are now settled (e.g. all surrendered), end the round
                    if (areAllHandsSettled(newPlayers)) {
                        addMessage("All hands settled.");
                        return endRoundAndPay_internal({ ...prev, players: newPlayers, dealerNet: newDealerNet, gameStage: 'dealer-turn' });
                    }
                    // --- END FIX ---
                 }
            }

            return { ...prev, players: newPlayers, gameStage: nextStage, currentPlayerId: nextPlayerId, currentHandId: nextHandId, dealerNet: newDealerNet }; 
        });
    };
    
    const setHandStatus = (playerId: number, handId: string, status: HandStatus, dealerScore: number = 0) => {
         setGameState(prev => {
            let playerWonAmount: number | null = null;
            let dealerNetChange = 0;
            let finalStatus = status;
            let handBet = 0;
            let handWager = 0;

            const newPlayers = prev.players.map(p => {
                if (p.id !== playerId) return p;
                
                const newHands = p.hands.map(h => {
                    if (h.id !== handId) return h;
                    handBet = h.bet; // Original bet
                    handWager = h.wager; // Amount at risk

                    if (status === 'blackjack') {
                        const payout = (prev.blackjackPayout === '3to2' ? handBet * 1.5 : handBet * 1.2); // --- FIX: BJ pays on original bet ---
                        playerWonAmount = handBet + payout; // Return original bet + winnings
                        dealerNetChange = -payout; // Dealer loses 1.5x (or 1.2x)
                        finalStatus = 'blackjack';
                    } else if (status === 'win') {
                        playerWonAmount = handBet + handWager; // --- FIX: Return original bet + wager ---
                        dealerNetChange = -handWager; // --- FIX: Dealer loses wager ---
                        finalStatus = 'win';
                    } else if (status === 'lose') {
                        playerWonAmount = 0; // Lose original bet (already deducted)
                        dealerNetChange = handWager; // --- FIX: Dealer wins wager ---
                        finalStatus = 'lose';
                    } else if (status === 'push') {
                        playerWonAmount = handBet; // --- FIX: Refund original bet ---
                        dealerNetChange = handWager - handBet; // --- FIX: If doubled, net 0. If not, net 0. ---
                        finalStatus = 'push';
                    } else if (status === 'busted') {
                        playerWonAmount = 0; // Lose original bet (already deducted)
                        dealerNetChange = handWager; // --- FIX: Dealer wins wager ---
                        finalStatus = 'busted';
                    }
                    
                    if (h.status === 'surrendered') {
                        playerWonAmount = 0; // Already refunded
                        dealerNetChange = 0; // Already handled in handlePlayerAction
                        finalStatus = 'surrendered';
                    }

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
                else if (finalStatus === 'lose') addMessage(`${player.name} (Hand ${handNum}) loses ₹${handWager}`);
                else if (finalStatus === 'busted') addMessage(`${player.name} (Hand ${handNum}) busted and loses ₹${handWager}`);
                else if (finalStatus === 'surrendered') addMessage(`${player.name} (Hand ${handNum}) surrendered and loses ₹${handBet / 2}`); // --- FIX: Show correct loss ---

            }

            // --- AUTO-SETTLE LOGIC ---
            if (areAllHandsSettled(newPlayers)) {
                // All hands are done, end the round
                addMessage("All hands settled.");
                return endRoundAndPay_internal({ ...prev, players: newPlayers, dealerNet: prev.dealerNet + dealerNetChange });
            }
            // --- END AUTO-SETTLE ---

            return { ...prev, players: newPlayers, dealerNet: prev.dealerNet + dealerNetChange };
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
                lastBets: Array(numHands).fill(prev.minBet), // UPDATED
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
             const newPlayers = prev.players.map(p => {
                if (p.id === playerId) {
                    // --- FIX: Adjust lastBets array to match new hand count ---
                    const newLastBets = [...p.lastBets];
                    if (numHands > newLastBets.length) {
                        // Add new bets, using the first bet as default
                        const defaultBet = newLastBets[0] || prev.minBet;
                        for(let i = newLastBets.length; i < numHands; i++) {
                            newLastBets.push(defaultBet);
                        }
                    } else if (numHands < newLastBets.length) {
                        // Truncate bets
                        newLastBets.length = numHands;
                    }
                    return { ...p, initialHandsCount: numHands, lastBets: newLastBets };
                }
                return p;
             });
            const player = prev.players.find(p => p.id === playerId);
            if (player) {
                 addMessage(`${toTitleCase(player.name)} will now play ${numHands} hand(s) per round.`);
            }
            return { ...prev, players: newPlayers };
         });
    }, [addMessage]);
    
    const unlockAllBets = useCallback(() => {
        setGameState(prev => {
            if (prev.gameStage !== 'betting') return prev;
            
            // Refund all bets and clear hands
            const newPlayers = prev.players.map(p => {
                let refundedAmount = 0;
                p.hands.forEach(h => {
                    refundedAmount += h.bet; // --- FIX: Refund the original bet ---
                });
                return {
                    ...p,
                    stack: p.stack + refundedAmount,
                    hands: Array(p.initialHandsCount).fill(null).map((_, i) => ({
                         id: `${p.id}-hand-${i}`,
                         cards: [],
                         bet: 0,
                         wager: 0, // ADDED
                         status: 'playing',
                         hasHit: false,
                    })),
                };
            });
            
            addMessage("Bets unlocked. Place new bets for all active hands.");
            return { ...prev, players: newPlayers, isBettingLocked: false };
        });
    }, [addMessage]);


    const actions = useMemo(() => ({
        setupNewGame, // ADDED
        setupGame,
        loadGame,
        placeBet,
        startRound,
        handlePlayerAction,
        setHandStatus,
        addPlayer,
        removePlayer,
        addChipsToPlayer,
        togglePlayerBreak,
        updatePlayerHandCount,
        unlockAllBets, 
    }), [setupNewGame, setupGame, loadGame, placeBet, startRound, handlePlayerAction, setHandStatus, // ADDED setupNewGame
         addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, updatePlayerHandCount, unlockAllBets]);

    return { gameState, actions };
};