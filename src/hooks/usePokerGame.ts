// src/hooks/usePokerGame.ts
import { useState, useCallback } from 'react';
import type { PokerGameState, PokerPlayer } from '../types/pokerGameTypes';
import type { Player } from '../types/gameTypes';

const createInitialGameState = (): PokerGameState => ({
    players: [],
    pot: 0,
    dealerIndex: -1,
    currentPlayerIndex: -1,
    currentBet: 0,
    isRoundActive: false,
    messages: ["Welcome to the Poker Bets Manager!"],
    smallBlindAmount: 10,
    bigBlindAmount: 20,
});

export const usePokerGame = () => {
    const [gameState, setGameState] = useState<PokerGameState>(createInitialGameState());

    const addMessage = useCallback((message: string) => {
        setGameState(prev => ({
            ...prev,
            messages: [...prev.messages.slice(-100), message]
        }));
    }, []);

    const startNewGame = (newPlayers: Player[]) => {
        const pokerPlayers: PokerPlayer[] = newPlayers.map(p => ({
            ...p,
            currentBet: 0,
            hasFolded: false,
        }));
        setGameState({
            ...createInitialGameState(),
            players: pokerPlayers,
            dealerIndex: Math.floor(Math.random() * pokerPlayers.length),
            messages: [`New poker game started with ${newPlayers.length} players. Click 'Start Round' to begin.`],
        });
    };

    const endRound = (winner: PokerPlayer) => {
        setGameState(prev => {
            const newPlayers = prev.players.map(p => {
                if (p.id === winner.id) {
                    return { ...p, balance: p.balance + prev.pot };
                }
                return { ...p, currentBet: 0, hasFolded: false };
            });
            return {
                ...createInitialGameState(),
                players: newPlayers,
                dealerIndex: prev.dealerIndex,
                messages: [...prev.messages, `${winner.name} wins the pot of ${prev.pot}!`],
            };
        });
    };

    const startRound = () => {
        setGameState(prev => {
            const players = prev.players.map(p => ({ ...p, currentBet: 0, hasFolded: false }));
            const dealerIndex = (prev.dealerIndex + 1) % players.length;
            const smallBlindIndex = (dealerIndex + 1) % players.length;
            const bigBlindIndex = (dealerIndex + 2) % players.length;

            // Handle heads-up (2 players) case for blinds
            const actualDealerIndex = players.length === 2 ? smallBlindIndex : dealerIndex;
            const actualSmallBlindIndex = players.length === 2 ? bigBlindIndex : smallBlindIndex;

            let pot = 0;
            const smallBlindAmount = Math.min(prev.smallBlindAmount, players[actualSmallBlindIndex].balance);
            players[actualSmallBlindIndex].balance -= smallBlindAmount;
            players[actualSmallBlindIndex].currentBet = smallBlindAmount;
            pot += smallBlindAmount;

            const bigBlindAmount = Math.min(prev.bigBlindAmount, players[bigBlindIndex].balance);
            players[bigBlindIndex].balance -= bigBlindAmount;
            players[bigBlindIndex].currentBet = bigBlindAmount;
            pot += bigBlindAmount;

            const currentPlayerIndex = (bigBlindIndex + 1) % players.length;

            return {
                ...prev,
                players,
                pot,
                dealerIndex: actualDealerIndex,
                currentPlayerIndex,
                currentBet: bigBlindAmount,
                isRoundActive: true,
                messages: [
                    ...prev.messages,
                    `--- New Round ---`,
                    `${players[actualSmallBlindIndex].name} posts small blind of ${smallBlindAmount}.`,
                    `${players[bigBlindIndex].name} posts big blind of ${bigBlindAmount}.`,
                    `It's ${players[currentPlayerIndex].name}'s turn.`,
                ],
            };
        });
    };

    const handlePlayerAction = (action: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: number) => {
        setGameState(prev => {
            const { players, currentPlayerIndex, currentBet } = prev;
            const currentPlayer = players[currentPlayerIndex];
            let newPlayers = [...players];
            let newPot = prev.pot;
            let newCurrentBet = currentBet;
            let message = '';

            switch (action) {
                case 'fold':
                    currentPlayer.hasFolded = true;
                    message = `${currentPlayer.name} folds.`;
                    break;
                case 'check':
                    if (currentBet > currentPlayer.currentBet) {
                        return prev; // Invalid action
                    }
                    message = `${currentPlayer.name} checks.`;
                    break;
                case 'call':
                    const callAmount = Math.min(currentBet - currentPlayer.currentBet, currentPlayer.balance);
                    currentPlayer.balance -= callAmount;
                    currentPlayer.currentBet += callAmount;
                    newPot += callAmount;
                    message = `${currentPlayer.name} calls ${callAmount}.`;
                    break;
                case 'bet':
                case 'raise':
                    const betAmount = amount!;
                    if (betAmount > currentPlayer.balance) return prev; // Invalid
                    const totalBet = currentPlayer.currentBet + betAmount;
                    currentPlayer.balance -= betAmount;
                    currentPlayer.currentBet = totalBet;
                    newPot += betAmount;
                    newCurrentBet = totalBet;
                    message = `${currentPlayer.name} ${action}s to ${totalBet}.`;
                    break;
            }

            const activePlayers = newPlayers.filter(p => !p.hasFolded);
            if (activePlayers.length <= 1) {
                endRound(activePlayers[0]);
                return { ...prev, isRoundActive: false, messages: [...prev.messages, message] };
            }

            let nextPlayerIndex = (currentPlayerIndex + 1) % newPlayers.length;
            while (newPlayers[nextPlayerIndex].hasFolded) {
                nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
            }

            return {
                ...prev,
                players: newPlayers,
                pot: newPot,
                currentBet: newCurrentBet,
                currentPlayerIndex: nextPlayerIndex,
                messages: [...prev.messages, message],
            };
        });
    };

    const nextBettingRound = () => {
        setGameState(prev => {
            const activePlayers = prev.players.filter(p => !p.hasFolded);
            const currentPlayerIndex = activePlayers.length > 0 ? prev.players.findIndex(p => p.id === activePlayers[0].id) : -1;

            return {
                ...prev,
                currentPlayerIndex,
                currentBet: 0,
                players: prev.players.map(p => ({ ...p, currentBet: 0 })),
                messages: [...prev.messages, `--- New Betting Round ---`],
            };
        });
    };

    return {
        gameState,
        actions: {
            startNewGame,
            startRound,
            handlePlayerAction,
            endRound,
            nextBettingRound,
        }
    };
};
