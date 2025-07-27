// src/poker/hooks/usePokerGame.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PokerGameState, PokerPlayer, GameStage, Pot } from '../types/pokerGameTypes';
import { calculatePots } from '../utils/pokerLogic';
import { toTitleCase } from '../../utils/formatters';
import { updateLifetimeWinnings } from '../../utils/lifetimeWinningsLogic';

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

        const newPlayers = currentState.players.map(p => ({ ...p, roundBet: 0, hasActed: false }));
        let newActiveIndex = currentState.dealerButtonIndex;
        do { newActiveIndex = (newActiveIndex + 1) % newPlayers.length; } while (!newPlayers[newActiveIndex].inHand || newPlayers[newActiveIndex].isAllIn);

        addMessage(`Action starts with ${toTitleCase(newPlayers[newActiveIndex].name)}.`);
        return { ...currentState, players: newPlayers, gameStage: newStage, currentBet: 0, lastRaiserId: null, lastRaiseAmount: currentState.bigBlindAmount, activePlayerIndex: newActiveIndex };
    }, [addMessage]);

    const getEndOfHandState = useCallback((winner: PokerPlayer, updatedPlayers: PokerPlayer[], prevGameState: PokerGameState): PokerGameState => {
        const totalPot = updatedPlayers.reduce((sum, p) => sum + p.totalPotContribution, 0);
        const winnerContribution = updatedPlayers.find(p => p.id === winner.id)?.totalPotContribution || 0;
        const winnings = totalPot - winnerContribution;
        updateLifetimeWinnings(winner.phoneNumber, 'poker', winnings);

        const finalPlayers = updatedPlayers.map(p => {
            const playerWithReset = { ...p, roundBet: 0, totalPotContribution: 0, inHand: false, isAllIn: false, hasActed: false };
            if (p.id === winner.id) {
                return { ...playerWithReset, stack: p.stack + totalPot };
            }
            return playerWithReset;
        });

        const finalWinner = finalPlayers.find(p => p.id === winner.id)!;
        const newMessages = [...prevGameState.messages.slice(-99), `--- HAND OVER ---`, `${toTitleCase(winner.name)} wins the pot of ₹${totalPot}. Their final stack is ₹${finalWinner.stack}.`];

        return {
            ...createInitialPokerState(),
            players: finalPlayers,
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
                    players.forEach((p: PokerPlayer) => { if (p.id !== player.id) p.hasActed = false });
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
                        const raiseAmount = totalBet - newCurrentBet;
                        const minRaise = newLastRaiseAmount || prev.bigBlindAmount;
                        if (raiseAmount >= minRaise) {
                            newLastRaiseAmount = raiseAmount;
                            players.forEach((p: PokerPlayer) => { if (p.id !== player.id) p.hasActed = false });
                            addMessage(`This is a valid raise. Action re-opened.`);
                        }
                        newCurrentBet = totalBet;
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
            id: i + 1, name: toTitleCase(p.name), stack: p.stack, phoneNumber: p.phoneNumber,
            totalBuyIn: p.stack,
            inHand: false, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false
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
            const playersWithChips = prev.players.filter(p => p.stack > 0);
            if (playersWithChips.length < 2) {
                addMessage("Not enough players with stacks to start a hand.");
                return prev;
            }

            let newDealerIndex = prev.dealerButtonIndex;
            do { newDealerIndex = (newDealerIndex + 1) % prev.players.length; } while (prev.players[newDealerIndex].stack === 0);

            let newSmallBlindIndex = newDealerIndex;
            do { newSmallBlindIndex = (newSmallBlindIndex + 1) % prev.players.length; } while (prev.players[newSmallBlindIndex].stack === 0);

            let newBigBlindIndex = newSmallBlindIndex;
            do { newBigBlindIndex = (newBigBlindIndex + 1) % prev.players.length; } while (prev.players[newBigBlindIndex].stack === 0);

            const newPlayers = prev.players.map(p => ({
                ...p, inHand: p.stack > 0, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false,
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

    const awardPot = useCallback((potIndex: number, winnerId: number) => {
        setGameState(prev => {
            const potToAward = prev.pot[potIndex];
            if (!potToAward) return prev;

            const winner = prev.players.find(p => p.id === winnerId);
            if(winner) {
                const winnerContribution = winner.totalPotContribution;
                const winnings = potToAward.amount - winnerContribution;
                updateLifetimeWinnings(winner.phoneNumber, 'poker', winnings);
            }

            let winnerName = '';
            const newPlayers = prev.players.map(p => {
                if (p.id === winnerId) {
                    winnerName = toTitleCase(p.name);
                    return { ...p, stack: p.stack + potToAward.amount };
                }
                return p;
            });

            addMessage(`${winnerName} wins a pot of ₹${potToAward.amount}.`);

            const newPots = prev.pot.filter((_, index) => index !== potIndex);

            if (newPots.length === 0) {
                addMessage("All pots awarded. Hand is over.");
                const finalPlayers = newPlayers.map(p => ({ ...p, inHand: false, isAllIn: false, roundBet: 0, totalPotContribution: 0, hasActed: false }));
                return {
                    ...prev,
                    players: finalPlayers,
                    pot: [],
                    gameStage: 'pre-deal',
                    activePlayerIndex: -1,
                };
            }
            return { ...prev, players: newPlayers, pot: newPots };
        });
    }, [addMessage]);

    const addPlayer = useCallback((name: string, stack: number) => {
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
                inHand: false,
                isAllIn: false,
                roundBet: 0,
                totalPotContribution: 0,
                hasActed: false
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

    const actions = useMemo(() => ({
        setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer
    }), [setupGame, startNewHand, handlePlayerAction, awardPot, loadGame, addPlayer, removePlayer, addChipsToPlayer]);

    return { gameState, actions };
};