// src/poker/hooks/usePokerGame.ts
import { useEffect, useCallback, useMemo } from 'react';
import type { PokerGameState, PokerPlayer, GameStage, Pot } from '../types/pokerGameTypes';
import { calculatePots } from '../utils/pokerLogic';
import { toTitleCase } from '../../utils/formatters';
import { bulkUpdateWinnings, type WinningsRecord } from '../../utils/winningsService';
import { splitEvenly } from '../../utils/money';
import { foldOutLine, foldOutStreak, handCandidate, handNets, nextStreak, potLine } from '../utils/streak';
import { pauseClock, resumeClock, startClock, tickLevel, withClock } from '../utils/blindLevels';
import { SHA256 } from 'crypto-js';
import { useUndo } from '../../hooks/useUndo';
import { useGameState } from '../../hooks/useGameState';
import { emptyStats, partialStats, recordRound } from '../../utils/nightStats';
import { pokerSettlement } from '../../utils/gameSettlement';
import { archiveOrWarn } from '../../utils/archive';
import { playerLabels } from '../../utils/owingsLogic';
import { rememberPlayers } from '../../utils/savedPlayers';

export const POKER_STORAGE_KEY = 'pokerGameState';

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
    blindLevel: 1,
    stats: emptyStats(),
    messages: ["Welcome to the Poker Bets Manager! Set up a new game to begin."],
});

// A parsed save with its Sets and newer fields restored.
const restorePoker = (parsed: PokerGameState): PokerGameState => {
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
            roundWinnings: p.roundWinnings ?? 0 // pots already won this hand count toward its result
        }));
    }
    return { ...parsed, blindLevel: parsed.blindLevel ?? 1, stats: parsed.stats ?? partialStats() };
};

// Poker does not load its save on launch, so a new game set up over it archives the saved copy.
const storedPoker = (): PokerGameState | null => {
    try {
        const saved = localStorage.getItem(POKER_STORAGE_KEY);
        return saved ? restorePoker(JSON.parse(saved)) : null;
    } catch {
        return null;
    }
};

export const usePokerGame = () => {
    const [gameState, setGameState, addMessage, afterCommit] = useGameState<PokerGameState>(createInitialPokerState);
    const { record, unrecorded, undo: undoStep, canUndo } = useUndo(gameState, setGameState, gameState.gameStage !== 'pre-deal');

    // The blind clock is outside undo: restoring a step keeps the live clock.
    const undo = useCallback(() => {
        const live = gameState;
        undoStep();
        setGameState(restored => withClock(restored, live));
    }, [gameState, undoStep, setGameState]);

    const loadGame = useCallback(() => {
        const savedState = localStorage.getItem(POKER_STORAGE_KEY);
        if (!savedState) {
            addMessage("No saved game found.");
            return false;
        };
        try {
            setGameState(restorePoker(JSON.parse(savedState)));
            return true;
        } catch {
            localStorage.removeItem(POKER_STORAGE_KEY);
            addMessage("Failed to load saved game, starting fresh.");
            return false;
        }
    }, [addMessage, setGameState]);

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

        afterCommit(() => bulkUpdateWinnings(recordsToUpdate));

        const finalPlayers = updatedPlayers.map(p => {
            const playerWithReset = { ...p, roundBet: 0, totalPotContribution: 0, inHand: false, isAllIn: false, hasActed: false, canOnlyCall: false };
            const winningStreak = foldOutStreak(p, winner.id, totalPot);
            return p.id === winner.id ? { ...playerWithReset, stack: p.stack + totalPot, winningStreak } : { ...playerWithReset, winningStreak };
        });

        const finalWinner = finalPlayers.find(p => p.id === winner.id)!;
        const newMessages = [...prevGameState.messages, `--- HAND OVER ---`, foldOutLine(toTitleCase(winner.name), totalPot, winner.totalPotContribution, finalWinner.stack)];
        const label = playerLabels(updatedPlayers);
        const nets = handNets(updatedPlayers.map(p => ({ ...p, roundWinnings: p.id === winner.id ? totalPot : 0 })), label);

        return {
            ...createInitialPokerState(),
            players: finalPlayers.map(p => ({ ...p, roundWinnings: 0 })), // Reset round winnings
            dealerButtonIndex: prevGameState.dealerButtonIndex,
            smallBlindAmount: prevGameState.smallBlindAmount,
            bigBlindAmount: prevGameState.bigBlindAmount,
            levelMinutes: prevGameState.levelMinutes,
            blindLevel: prevGameState.blindLevel,
            levelEndsAt: prevGameState.levelEndsAt,
            pausedRemainingMs: prevGameState.pausedRemainingMs,
            stats: recordRound(prevGameState.stats ?? emptyStats(), nets, handCandidate(updatedPlayers, label, updatedPlayers.find(p => p.id === winner.id))),
            messages: newMessages,
        };
    }, [afterCommit]);

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
                    if (player.stack === 0) player.isAllIn = true;
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
    }, [addMessage, advanceToNextStageOrShowdown, getEndOfHandState, setGameState]);

    const setupGame = useCallback((players: { name: string, stack: number, phoneNumber: string }[], blinds: { sb: number, bb: number }, levelMinutes?: number) => {
        const initialPlayers: PokerPlayer[] = players.map((p, i) => ({
            id: i + 1, name: toTitleCase(p.name), stack: p.stack,
            totalBuyIn: p.stack, phoneNumber: p.phoneNumber,
            inHand: false, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false,
            isTakingBreak: false, canOnlyCall: false,
            winningStreak: 0,
            roundWinnings: 0
        }));

        setGameState(prev => {
            const previous = prev.players.length > 0 ? prev : storedPoker();
            afterCommit(() => { if (previous) archiveOrWarn('poker', previous.stats, pokerSettlement(previous)); });
            return {
                ...createInitialPokerState(),
                ...startClock(levelMinutes, Date.now()),
                players: initialPlayers,
                smallBlindAmount: blinds.sb,
                bigBlindAmount: blinds.bb,
                dealerButtonIndex: -1,
                messages: [`Game setup with ${players.length} players. Blinds are ${blinds.sb}/${blinds.bb}. Click 'Start Next Hand' to begin.`]
            };
        });
        const full = rememberPlayers(initialPlayers.map(p => ({ name: p.name, phone: p.phoneNumber })));
        if (full) addMessage(full);
    }, [setGameState, afterCommit, addMessage]);

    const startNewHand = useCallback(() => {
        setGameState(prev => {
            // UPDATED LOGIC: Filter out players on break or with no chips
            const playersWithChips = prev.players.filter(p => p.stack > 0 && !p.isTakingBreak);
            if (playersWithChips.length < 2) {
                addMessage("Not enough active players with stacks to start a hand.");
                return prev;
            }
            const { state: leveled, line: levelLine } = tickLevel(prev, Date.now());
            
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
            const sbAmount = Math.min(leveled.smallBlindAmount, sbPlayer.stack);
            sbPlayer.stack -= sbAmount; sbPlayer.roundBet = sbAmount; sbPlayer.totalPotContribution = sbAmount;
            if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;

            const bbPlayer = newPlayers[newBigBlindIndex];
            const bbAmount = Math.min(leveled.bigBlindAmount, bbPlayer.stack);
            bbPlayer.stack -= bbAmount; bbPlayer.roundBet = bbAmount; bbPlayer.totalPotContribution = bbAmount;
            if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;

            let firstToActIndex = newBigBlindIndex;
            do { firstToActIndex = (firstToActIndex + 1) % prev.players.length; } while (!newPlayers[firstToActIndex].inHand);

            newPlayers[newSmallBlindIndex].hasActed = true;

            const messages = [
                ...prev.messages,
                `--- NEW HAND (#${prev.dealerButtonIndex + 2}) ---`,
                ...(levelLine ? [levelLine] : []),
                `Dealer button is on ${toTitleCase(newPlayers[newDealerIndex].name)}.`,
                `${toTitleCase(sbPlayer.name)} posts small blind of ₹${sbAmount}.`,
                `${toTitleCase(bbPlayer.name)} posts big blind of ₹${bbAmount}.`,
                `Total Pot: ₹${sbAmount + bbAmount}`,
                `Action is on ${toTitleCase(newPlayers[firstToActIndex].name)}.`,
            ];

            return {
                ...leveled,
                players: newPlayers,
                gameStage: 'pre-flop',
                pot: [],
                currentBet: leveled.bigBlindAmount,
                lastRaiseAmount: leveled.bigBlindAmount,
                activePlayerIndex: firstToActIndex,
                dealerButtonIndex: newDealerIndex,
                smallBlindIndex: newSmallBlindIndex,
                bigBlindIndex: newBigBlindIndex,
                messages,
            };
        });
    }, [addMessage, setGameState]);

    const awardPot = useCallback((potIndex: number, winnerIds: number[]) => {
        setGameState(prev => {
            const potToAward = prev.pot[potIndex];
            if (!potToAward) return prev;

            // Odd chips go to the winners first left of the dealer button.
            const n = prev.players.length;
            const winnersBySeat = prev.players
                .map((_, i) => prev.players[(prev.dealerButtonIndex + 1 + i + n) % n].id)
                .filter(id => winnerIds.includes(id));
            const shares = splitEvenly(potToAward.amount, winnersBySeat.length);
            const shareOf = new Map(winnersBySeat.map((id, i) => [id, shares[i]]));
            const splitAmount = Math.floor(potToAward.amount / winnersBySeat.length);
            const winnerNames: string[] = [];

            const newPlayers = prev.players.map(p => {
                const share = shareOf.get(p.id);
                if (share !== undefined) {
                    winnerNames.push(toTitleCase(p.name));
                    return { ...p, stack: p.stack + share, roundWinnings: p.roundWinnings + share };
                }
                return p;
            });

            const oddNote = shares.some(s => s !== splitAmount) ? ', odd chips to the first left of the dealer' : '';
            addMessage(potLine(winnerNames, potToAward.amount, potToAward.eligiblePlayers.size, splitAmount, oddNote));

            const newPots = prev.pot.filter((_, index) => index !== potIndex);

            if (newPots.length === 0) {
                addMessage("All pots awarded. Hand is over.");

                const recordsToUpdate: WinningsRecord[] = [];
                const timestamp = new Date().toISOString();

                prev.players.forEach(p_initial => {
                    if (p_initial.phoneNumber) {
                        const p_final = newPlayers.find(p => p.id === p_initial.id);
                        if (p_final) {
                            // Whole-hand result: every pot this player won, not just this last one.
                            const finalWinnings = p_final.roundWinnings - p_initial.totalPotContribution;

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

                afterCommit(() => bulkUpdateWinnings(recordsToUpdate));

                // Reset hand state for everyone, apply streak logic
                const finalPlayersWithStreak = newPlayers.map(p => ({ 
                    ...p, 
                    inHand: false, 
                    isAllIn: false, 
                    roundBet: 0, 
                    totalPotContribution: 0, 
                    hasActed: false, 
                    canOnlyCall: false,
                    winningStreak: nextStreak(p, p.roundWinnings),
                    roundWinnings: 0, // Reset for next hand
                    totalBuyIn: p.totalBuyIn 
                }));

                return {
                    ...prev,
                    players: finalPlayersWithStreak, 
                    pot: [],
                    gameStage: 'pre-deal',
                    activePlayerIndex: -1,
                    stats: recordRound(prev.stats ?? emptyStats(), handNets(newPlayers, playerLabels(newPlayers)), handCandidate(newPlayers, playerLabels(newPlayers))),
                };
            }

            return { ...prev, players: newPlayers, pot: newPots };
        });
    }, [addMessage, setGameState, afterCommit]);

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
            afterCommit(() => {
                const full = rememberPlayers([{ name: newPlayer.name, phone: phoneNumber }]);
                if (full) addMessage(full);
            });
            return { ...prev, players: [...prev.players, newPlayer] };
        });
    }, [addMessage, setGameState, afterCommit]);

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
    }, [addMessage, setGameState]);

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
    }, [addMessage, setGameState]);

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
    }, [addMessage, setGameState]);

    const applyStreakWinnings = useCallback((winnerId: number, amount: number) => {
        setGameState(prev => {
            if (amount <= 0) return prev;
            if (prev.gameStage !== 'pre-deal') {
                addMessage("Can only give streak winnings between hands.");
                return prev;
            }

            const winner = prev.players.find(p => p.id === winnerId);
            if (!winner) return prev;

            // Players on break don't pay.
            const payerIds = new Set(prev.players.filter(p => p.id !== winnerId && !p.isTakingBreak).map(p => p.id));
            const totalDeducted = amount * payerIds.size;
            const finalPlayers = prev.players.map(p => {
                if (p.id === winnerId) return { ...p, stack: p.stack + totalDeducted };
                return payerIds.has(p.id) ? { ...p, stack: p.stack - amount } : p;
            });

            const timestamp = new Date().toISOString();
            const recordsToUpdate: WinningsRecord[] = prev.players
                .filter(p => p.phoneNumber && (p.id === winnerId || payerIds.has(p.id)))
                .map(p => ({
                    phoneHash: SHA256(p.phoneNumber!).toString(),
                    playerName: p.name,
                    gameType: 'poker',
                    winnings: p.id === winnerId ? totalDeducted : -amount,
                    timestamp,
                }));
            if (totalDeducted > 0) afterCommit(() => bulkUpdateWinnings(recordsToUpdate));

            addMessage(`Streak Winnings! ${toTitleCase(winner.name)} receives ₹${totalDeducted} (₹${amount} from each of ${payerIds.size} player${payerIds.size === 1 ? '' : 's'}).`);
            return { ...prev, players: finalPlayers };
        });
    }, [addMessage, setGameState, afterCommit]);

    const pauseBlindClock = useCallback(() => {
        setGameState(prev => (!prev.levelMinutes || prev.pausedRemainingMs !== undefined) ? prev
            : { ...pauseClock(prev, Date.now()), messages: [...prev.messages, 'Blind clock paused.'] });
    }, [setGameState]);

    const resumeBlindClock = useCallback(() => {
        setGameState(prev => prev.pausedRemainingMs === undefined ? prev
            : { ...resumeClock(prev, Date.now()), messages: [...prev.messages, 'Blind clock resumed.'] });
    }, [setGameState]);

    // Empties the game and its saved copy (used after handing the game to another phone).
    const clearGame = useCallback(() => {
        localStorage.removeItem(POKER_STORAGE_KEY);
        setGameState(createInitialPokerState());
    }, [setGameState]);

    const actions = useMemo(() => ({
        setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, applyStreakWinnings, clearGame
    }), [setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, applyStreakWinnings, clearGame]);

    // PAUSE and RESUME are not undo steps.
    const recordedActions = useMemo(
        () => ({ ...record(actions), pauseBlindClock: unrecorded(pauseBlindClock), resumeBlindClock: unrecorded(resumeBlindClock) }),
        [record, unrecorded, actions, pauseBlindClock, resumeBlindClock]
    );
    const autoAwardPot = useMemo(() => unrecorded(awardPot), [unrecorded, awardPot]);

    // autoAwardPot is unrecorded: the showdown effect calls it, and undo must not land on a state it re-fires from.
    return { gameState, actions: recordedActions, autoAwardPot, undo, canUndo };
};