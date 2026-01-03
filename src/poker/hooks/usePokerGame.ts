// src/poker/hooks/usePokerGame.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PokerGameState, PokerPlayer, GameStage, Pot } from '../types/pokerGameTypes';
import { calculatePots } from '../utils/pokerLogic';
import { toTitleCase } from '../../utils/formatters';
import { bulkUpdateWinnings, type WinningsRecord } from '../../utils/winningsService';
import { SHA256 } from 'crypto-js';

const POKER_STORAGE_KEY = 'pokerGameState';

const createInitialPokerState = (): PokerGameState => ({
    players: [],
    gameStage: 'pre-deal',
    pot: [],
    currentBet: 0,
    lastRaiserId: null,
    lastRaiseAmount: null,
    activePlayerIndex: -1,
    dealerButtonIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    smallBlindAmount: 10,
    bigBlindAmount: 20,
    messages: ["Welcome to the Poker Bets Manager! Set up a new game to begin."],
});

export const usePokerGame = () => {
    const [gameState, setGameState] = useState<PokerGameState>(createInitialPokerState);

    const addMessage = useCallback((message: string) => {
        setGameState(prev => ({
            ...prev,
            messages: [...prev.messages.slice(-100), message]
        }));
    }, []);

    const loadGame = useCallback(() => {
        const savedState = localStorage.getItem(POKER_STORAGE_KEY);
        if (!savedState) {
            addMessage("No saved game found.");
            return false;
        };
        try {
            const parsed = JSON.parse(savedState);
            if (parsed.pot) {
                parsed.pot.forEach((p: Pot) => {
                    if (p.eligiblePlayers && !(p.eligiblePlayers instanceof Set)) {
                        p.eligiblePlayers = new Set(Array.from(p.eligiblePlayers));
                    }
                });
            }
            if (parsed.players) {
                parsed.players = parsed.players.map((p: any) => ({
                    ...p,
                    winningStreak: p.winningStreak ?? 0,
                    roundWinnings: 0 // Always reset on load
                }));
            }
            setGameState(parsed);
            return true;
        } catch {
            localStorage.removeItem(POKER_STORAGE_KEY);
            addMessage("Failed to load saved game, starting fresh.");
            return false;
        }
    }, [addMessage]);

    useEffect(() => {
        if (gameState.players.length > 0) {
            const stateToSave = {
                ...gameState,
                pot: gameState.pot.map(p => ({ ...p, eligiblePlayers: Array.from(p.eligiblePlayers) }))
            };
            localStorage.setItem(POKER_STORAGE_KEY, JSON.stringify(stateToSave));
        }
    }, [gameState]);

    const advanceToNextStageOrShowdown = useCallback((currentState: PokerGameState): PokerGameState => {
        const currentTotalPot = currentState.players.reduce((sum, p) => sum + p.totalPotContribution, 0);
        addMessage(`--- End of Betting Round. Total Pot: ₹${currentTotalPot} ---`);

        const playersInHand = currentState.players.filter(p => p.inHand);
        if (currentState.gameStage === 'river' || playersInHand.filter(p => !p.isAllIn && p.stack > 0).length < 2) {
            addMessage("All betting is complete. Calculating final pots for showdown.");
            const finalPots = calculatePots(currentState.players);
            return { ...currentState, gameStage: 'showdown', pot: finalPots, activePlayerIndex: -1 };
        }

        const nextStageMap: Record<GameStage, GameStage> = {
            'pre-deal': 'pre-flop', 'pre-flop': 'flop', 'flop': 'turn',
            'turn': 'river', 'river': 'showdown', 'showdown': 'pre-deal',
        };
        const newStage = nextStageMap[currentState.gameStage];
        addMessage(`--- Dealing the ${toTitleCase(newStage)} ---`);

        const newPlayers = currentState.players.map(p => ({ ...p, roundBet: 0, hasActed: false, canOnlyCall: false }));
        let newActiveIndex = currentState.dealerButtonIndex;
        do { newActiveIndex = (newActiveIndex + 1) % newPlayers.length; } while (!newPlayers[newActiveIndex].inHand || newPlayers[newActiveIndex].isAllIn);

        addMessage(`Action starts with ${toTitleCase(newPlayers[newActiveIndex].name)}.`);
        return { ...currentState, players: newPlayers, gameStage: newStage, currentBet: 0, lastRaiserId: null, lastRaiseAmount: currentState.bigBlindAmount, activePlayerIndex: newActiveIndex };
    }, [addMessage]);

    const getEndOfHandState = useCallback((winner: PokerPlayer, updatedPlayers: PokerPlayer[], prevGameState: PokerGameState): PokerGameState => {
        const totalPot = updatedPlayers.reduce((sum, p) => sum + p.totalPotContribution, 0);

        const recordsToUpdate: WinningsRecord[] = [];
        const timestamp = new Date().toISOString();

        updatedPlayers.forEach(p => {
            if (p.phoneNumber) {
                const winnings = p.id === winner.id ? totalPot - p.totalPotContribution : -p.totalPotContribution;
                if (winnings !== 0) {
                    recordsToUpdate.push({
                        phoneHash: SHA256(p.phoneNumber).toString(),
                        playerName: p.name,
                        gameType: 'poker',
                        winnings,
                        timestamp
                    });
                }
            }
        });

        bulkUpdateWinnings(recordsToUpdate);

        const finalPlayers = updatedPlayers.map(p => {
            const playerWithReset = { ...p, roundBet: 0, totalPotContribution: 0, inHand: false, isAllIn: false, hasActed: false, canOnlyCall: false };
            if (p.id === winner.id) {
                return { ...playerWithReset, stack: p.stack + totalPot, winningStreak: p.winningStreak + 1 };
            }
            return { ...playerWithReset, winningStreak: 0 };
        });

        const finalWinner = finalPlayers.find(p => p.id === winner.id)!;
        const newMessages = [...prevGameState.messages.slice(-99), `--- HAND OVER ---`, `${toTitleCase(winner.name)} wins the pot of ₹${totalPot}. Their final stack is ₹${finalWinner.stack}.`];

        return {
            ...createInitialPokerState(),
            players: finalPlayers.map(p => ({ ...p, roundWinnings: 0 })), // Reset round winnings
            dealerButtonIndex: prevGameState.dealerButtonIndex,
            smallBlindAmount: prevGameState.smallBlindAmount,
            bigBlindAmount: prevGameState.bigBlindAmount,
            messages: newMessages,
        };
    }, []);

    const handlePlayerAction = useCallback((action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in', amount = 0) => {
        setGameState(prev => {
            const players = JSON.parse(JSON.stringify(prev.players));
            const player = players[prev.activePlayerIndex];
            if (!player) return prev;

            let newCurrentBet = prev.currentBet;
            let newLastRaiseAmount = prev.lastRaiseAmount;

            player.hasActed = true;
            player.canOnlyCall = false; // Any action resets this flag for the current player

            switch (action) {
                case 'fold':
                    player.inHand = false;
                    addMessage(`${toTitleCase(player.name)} folds.`);
                    break;
                case 'check':
                    if (player.roundBet < newCurrentBet) {
                        addMessage("Cannot check, there is a bet to you.");
                        return prev;
                    }
                    addMessage(`${toTitleCase(player.name)} checks.`);
                    break;
                case 'call': {
                    const callAmount = Math.min(newCurrentBet - player.roundBet, player.stack);
                    player.stack -= callAmount;
                    player.roundBet += callAmount;
                    player.totalPotContribution += callAmount;
                    if (player.stack === 0) player.isAllIn = true;
                    addMessage(`${toTitleCase(player.name)} calls ₹${callAmount}.`);
                    break;
                }
                case 'bet':
                case 'raise': {
                    const isRaiseAction = newCurrentBet > 0;
                    const minBetOrRaiseAmount = newLastRaiseAmount || prev.bigBlindAmount;
                    const costToPlayer = amount - player.roundBet;

                    if (costToPlayer > player.stack) {
                        addMessage("Cannot bet more than your stack.");
                        return prev;
                    }

                    if (isRaiseAction) {
                        const raiseAmount = amount - newCurrentBet;
                        if (raiseAmount < minBetOrRaiseAmount) {
                            addMessage(`Raise must be by at least ₹${minBetOrRaiseAmount}. Total bet must be at least ₹${newCurrentBet + minBetOrRaiseAmount}.`);
                            return prev;
                        }
                        newLastRaiseAmount = raiseAmount;
                        addMessage(`${toTitleCase(player.name)} raises to ₹${amount} (a raise of ₹${costToPlayer}).`);
                    } else {
                        if (amount < minBetOrRaiseAmount) {
                            addMessage(`Bet must be at least ₹${minBetOrRaiseAmount}.`);
                            return prev;
                        }
                        newLastRaiseAmount = amount;
                        addMessage(`${toTitleCase(player.name)} bets ₹${amount}.`);
                    }

                    player.stack -= costToPlayer;
                    player.totalPotContribution += costToPlayer;
                    player.roundBet = amount;
                    newCurrentBet = amount;
                    players.forEach((p: PokerPlayer) => {
                        if (p.id !== player.id) {
                            p.hasActed = false;
                            p.canOnlyCall = false;
                        }
                    });
                    break;
                }
                case 'all-in': {
                    const allInAmount = player.stack;
                    const totalBet = player.roundBet + allInAmount;
                    addMessage(`${toTitleCase(player.name)} is ALL-IN with their last ₹${allInAmount}.`);
                    player.totalPotContribution += allInAmount;
                    player.roundBet = totalBet;
                    player.stack = 0;
                    player.isAllIn = true;
                    if (totalBet > newCurrentBet) {
                        // This all-in is a raise.
                        const raiseAmount = totalBet - newCurrentBet;
                        const minRaise = newLastRaiseAmount || prev.bigBlindAmount;
                        if (raiseAmount >= minRaise) {
                            // This is a "full" or "valid" raise. Action is re-opened for everyone.
                            newLastRaiseAmount = raiseAmount;
                            players.forEach((p: PokerPlayer) => {
                                if (p.id !== player.id) {
                                    p.hasActed = false;
                                    p.canOnlyCall = false; // Everyone can act freely
                                }
                            });
                            addMessage(`This is a valid raise. Action re-opened.`);
                        } else {
                            // This is an "incomplete" raise.
                            players.forEach((p: PokerPlayer) => {
                                if (p.id !== player.id && p.inHand && !p.isAllIn) {
                                    if (p.roundBet < totalBet) {
                                        // They must act again (call or fold).
                                        p.hasActed = false;
                                        // If they already matched the *previous* bet, they can only call.
                                        if (p.roundBet === newCurrentBet) {
                                            p.canOnlyCall = true;
                                        } else {
                                            p.canOnlyCall = false; // They haven't even called the prev bet, they can raise.
                                        }
                                    }
                                }
                            });
                            addMessage(`This all-in is not a full raise. Players may only call or fold.`);
                        }
                        newCurrentBet = totalBet; // The new bet to match is the all-in amount
                    }
                    break;
                }
            }

            const playersLeftInHand = players.filter((p: PokerPlayer) => p.inHand);
            if (playersLeftInHand.length === 1) {
                return getEndOfHandState(playersLeftInHand[0], players, prev);
            }

            const activeBettors = players.filter((p: PokerPlayer) => p.inHand && !p.isAllIn);
            const allBetsMatched = activeBettors.every((p: { roundBet: number; }) => p.roundBet === newCurrentBet);
            const allHaveActed = activeBettors.every((p: { hasActed: boolean; }) => p.hasActed);

            if (allBetsMatched && allHaveActed) {
                return advanceToNextStageOrShowdown({ ...prev, players, currentBet: newCurrentBet, lastRaiseAmount: newLastRaiseAmount });
            }

            let nextIndex = prev.activePlayerIndex;
            for (let i = 1; i <= players.length; i++) {
                nextIndex = (prev.activePlayerIndex + i) % players.length;
                if (players[nextIndex].inHand && !players[nextIndex].isAllIn) {
                    break;
                }
            }

            addMessage(`Action is on ${toTitleCase(players[nextIndex].name)}.`);
            return { ...prev, players, currentBet: newCurrentBet, lastRaiseAmount: newLastRaiseAmount, activePlayerIndex: nextIndex };
        });
    }, [addMessage, advanceToNextStageOrShowdown, getEndOfHandState]);

    const setupGame = useCallback((players: { name: string, stack: number, phoneNumber: string }[], blinds: { sb: number, bb: number }) => {
        const initialPlayers: PokerPlayer[] = players.map((p, i) => ({
            id: i + 1, name: toTitleCase(p.name), stack: p.stack,
            totalBuyIn: p.stack, phoneNumber: p.phoneNumber,
            inHand: false, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false,
            isTakingBreak: false, canOnlyCall: false,
            winningStreak: 0,
            roundWinnings: 0
        }));

        setGameState({
            ...createInitialPokerState(),
            players: initialPlayers,
            smallBlindAmount: blinds.sb,
            bigBlindAmount: blinds.bb,
            dealerButtonIndex: -1,
            messages: [`Game setup with ${players.length} players. Blinds are ${blinds.sb}/${blinds.bb}. Click 'Start Next Hand' to begin.`]
        });
    }, []);

    const startNewHand = useCallback(() => {
        setGameState(prev => {
            // UPDATED LOGIC: Filter out players on break or with no chips
            const playersWithChips = prev.players.filter(p => p.stack > 0 && !p.isTakingBreak);
            if (playersWithChips.length < 2) {
                addMessage("Not enough active players with stacks to start a hand.");
                return prev;
            }
            
            const activePlayerIds = new Set(playersWithChips.map(p => p.id));

            let newDealerIndex = prev.dealerButtonIndex;
            do { newDealerIndex = (newDealerIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newDealerIndex].id));

            let newSmallBlindIndex = newDealerIndex;
            do { newSmallBlindIndex = (newSmallBlindIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newSmallBlindIndex].id));

            let newBigBlindIndex = newSmallBlindIndex;
            do { newBigBlindIndex = (newBigBlindIndex + 1) % prev.players.length; } while (!activePlayerIds.has(prev.players[newBigBlindIndex].id));

            const newPlayers = prev.players.map(p => ({
                ...p, 
                inHand: activePlayerIds.has(p.id), // This line now correctly deals out players on break
                isAllIn: false, 
                roundBet: 0, 
                totalPotContribution: 0, 
                hasActed: false,
                canOnlyCall: false
            }));

            const sbPlayer = newPlayers[newSmallBlindIndex];
            const sbAmount = Math.min(prev.smallBlindAmount, sbPlayer.stack);
            sbPlayer.stack -= sbAmount; sbPlayer.roundBet = sbAmount; sbPlayer.totalPotContribution = sbAmount;
            if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;

            const bbPlayer = newPlayers[newBigBlindIndex];
            const bbAmount = Math.min(prev.bigBlindAmount, bbPlayer.stack);
            bbPlayer.stack -= bbAmount; bbPlayer.roundBet = bbAmount; bbPlayer.totalPotContribution = bbAmount;
            if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;

            let firstToActIndex = newBigBlindIndex;
            do { firstToActIndex = (firstToActIndex + 1) % prev.players.length; } while (!newPlayers[firstToActIndex].inHand);

            newPlayers[newSmallBlindIndex].hasActed = true;

            const messages = [
                ...prev.messages,
                `--- NEW HAND (#${prev.dealerButtonIndex + 2}) ---`,
                `Dealer button is on ${toTitleCase(newPlayers[newDealerIndex].name)}.`,
                `${toTitleCase(sbPlayer.name)} posts small blind of ₹${sbAmount}.`,
                `${toTitleCase(bbPlayer.name)} posts big blind of ₹${bbAmount}.`,
                `Total Pot: ₹${sbAmount + bbAmount}`,
                `Action is on ${toTitleCase(newPlayers[firstToActIndex].name)}.`,
            ];

            return {
                ...prev,
                players: newPlayers,
                gameStage: 'pre-flop',
                pot: [],
                currentBet: prev.bigBlindAmount,
                lastRaiseAmount: prev.bigBlindAmount,
                activePlayerIndex: firstToActIndex,
                dealerButtonIndex: newDealerIndex,
                smallBlindIndex: newSmallBlindIndex,
                bigBlindIndex: newBigBlindIndex,
                messages,
            };
        });
    }, [addMessage]);

    const awardPot = useCallback((potIndex: number, winnerIds: number[]) => {
        setGameState(prev => {
            const potToAward = prev.pot[potIndex];
            if (!potToAward) return prev;

            const splitAmount = Math.floor(potToAward.amount / winnerIds.length);
            const winnerNames: string[] = [];

            const newPlayers = prev.players.map(p => {
                if (winnerIds.includes(p.id)) {
                    winnerNames.push(toTitleCase(p.name));
                    return { ...p, stack: p.stack + splitAmount, roundWinnings: p.roundWinnings + splitAmount };
                }
                return p;
            });

            addMessage(`${winnerNames.join(' & ')} win(s) the pot of ₹${potToAward.amount} (Split: ₹${splitAmount} each).`);

            const newPots = prev.pot.filter((_, index) => index !== potIndex);

            if (newPots.length === 0) {
                addMessage("All pots awarded. Hand is over.");

                const recordsToUpdate: WinningsRecord[] = [];
                const timestamp = new Date().toISOString();

                prev.players.forEach(p_initial => {
                    if (p_initial.phoneNumber) {
                        const p_final = newPlayers.find(p => p.id === p_initial.id);
                        if (p_final) {
                            const amountWon = p_final.stack - p_initial.stack;
                            const finalWinnings = amountWon - p_initial.totalPotContribution;

                            if (finalWinnings !== 0) {
                                recordsToUpdate.push({
                                    phoneHash: SHA256(p_initial.phoneNumber).toString(),
                                    playerName: p_initial.name,
                                    gameType: 'poker',
                                    winnings: finalWinnings,
                                    timestamp
                                });
                            }
                        }
                    }
                });

                bulkUpdateWinnings(recordsToUpdate);

                const maxRoundWinnings = Math.max(...newPlayers.map(p => p.roundWinnings));
                
                // Reset hand state for everyone, apply streak logic
                const finalPlayersWithStreak = newPlayers.map(p => ({ 
                    ...p, 
                    inHand: false, 
                    isAllIn: false, 
                    roundBet: 0, 
                    totalPotContribution: 0, 
                    hasActed: false, 
                    canOnlyCall: false,
                    winningStreak: (p.roundWinnings === maxRoundWinnings && p.roundWinnings > 0) ? p.winningStreak + 1 : 0, 
                    roundWinnings: 0, // Reset for next hand
                    totalBuyIn: p.totalBuyIn 
                }));

                return {
                    ...prev,
                    players: finalPlayersWithStreak, 
                    pot: [],
                    gameStage: 'pre-deal',
                    activePlayerIndex: -1,
                };
            }

            return { ...prev, players: newPlayers, pot: newPots };
        });
    }, [addMessage]);

    const addPlayer = useCallback((name: string, stack: number, phoneNumber: string) => {
        if (!name || stack < 0) return;
        setGameState(prev => {
            if (prev.gameStage !== 'pre-deal') {
                addMessage("Can only add players between hands.");
                return prev;
            }
            const newId = prev.players.length > 0 ? Math.max(...prev.players.map(p => p.id)) + 1 : 1;
            const newPlayer: PokerPlayer = {
                id: newId,
                name: toTitleCase(name),
                stack,
                totalBuyIn: stack,
                phoneNumber,
                inHand: false,
                isAllIn: false,
                roundBet: 0,
                totalPotContribution: 0,
                hasActed: false,
                isTakingBreak: false, 
                canOnlyCall: false,
                winningStreak: 0,
                roundWinnings: 0
            };
            addMessage(`Player ${toTitleCase(name)} has been added with a buy-in of ₹${stack}.`);
            return { ...prev, players: [...prev.players, newPlayer] };
        });
    }, [addMessage]);

    const removePlayer = useCallback((playerId: number) => {
        setGameState(prev => {
            if (prev.gameStage !== 'pre-deal') {
                addMessage("Can only remove players between hands.");
                return prev;
            }
            const playerToRemove = prev.players.find(p => p.id === playerId);
            if (playerToRemove) {
                addMessage(`Player ${toTitleCase(playerToRemove.name)} has been removed from the game.`);
            }
            return { ...prev, players: prev.players.filter(p => p.id !== playerId) };
        });
    }, [addMessage]);

    const addChipsToPlayer = useCallback((playerId: number, amount: number) => {
        if (amount <= 0) return;
        setGameState(prev => {
            if (prev.gameStage !== 'pre-deal') {
                addMessage("Can only add chips between hands.");
                return prev;
            }

            const newPlayers = prev.players.map(p => {
                if (p.id === playerId) {
                    addMessage(`Added ₹${amount} to ${toTitleCase(p.name)}'s stack. Their total buy-in is now ₹${p.totalBuyIn + amount}.`);
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
            if (prev.gameStage !== 'pre-deal') {
                addMessage("Can only take a break between hands.");
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

    const applyStreakWinnings = useCallback((winnerId: number, amount: number) => {
        setGameState(prev => {
            if (amount <= 0) return prev;
            
            const winner = prev.players.find(p => p.id === winnerId);
            if (!winner) return prev;

            let totalDeducted = 0;
            const newPlayers = prev.players.map(p => {
                if (p.id === winnerId) return p; // Will update winner later

                // Deduct from everyone else
                const deduction = amount;
                totalDeducted += deduction;
                return { ...p, stack: p.stack - deduction };
            });

            // Add to winner and update streaks
            const finalPlayers = newPlayers.map(p => {
                if (p.id === winnerId) {
                    return { ...p, stack: p.stack + totalDeducted, winningStreak: p.winningStreak + 1 };
                }
                return { ...p, winningStreak: 0 };
            });

            addMessage(`Streak Winnings! ${toTitleCase(winner.name)} receives ₹${totalDeducted} (₹${amount} from each player).`);
            return { ...prev, players: finalPlayers };
        });
    }, [addMessage]);

    const actions = useMemo(() => ({
        setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, applyStreakWinnings
    }), [setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, applyStreakWinnings]);

    return { gameState, actions };
};