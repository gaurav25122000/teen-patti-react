// src/hooks/usePokerGame.ts
import { useState, useCallback } from 'react';
import type { PokerGameState, PokerPlayer, Card, BettingRound } from '../types/pokerGameTypes';
import type { Player } from '../types/gameTypes';

const SUITS: Card['suit'][] = ['H', 'D', 'C', 'S'];
const RANKS: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const createDeck = (): Card[] => {
    return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
};

const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const createInitialGameState = (): PokerGameState => ({
    players: [],
    pot: 0,
    communityCards: [],
    deck: [],
    dealerIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    currentPlayerIndex: -1,
    currentBet: 0,
    bettingRound: 'pre-flop',
    isRoundActive: false,
    messages: ["Welcome to the Poker Table!"],
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
            cards: [],
            currentBet: 0,
            isAllIn: false,
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
                return p;
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
            const players = prev.players.map(p => ({ ...p, cards: [], currentBet: 0, isAllIn: false, hasFolded: false }));
            const deck = shuffleDeck(createDeck());

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

            for (let i = 0; i < 2; i++) {
                for (const player of players) {
                    player.cards.push(deck.pop()!);
                }
            }

            const currentPlayerIndex = (bigBlindIndex + 1) % players.length;

            return {
                ...prev,
                players,
                deck,
                pot,
                dealerIndex: actualDealerIndex,
                smallBlindIndex: actualSmallBlindIndex,
                bigBlindIndex,
                currentPlayerIndex,
                currentBet: bigBlindAmount,
                bettingRound: 'pre-flop',
                isRoundActive: true,
                communityCards: [],
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

    const advanceBettingRound = () => {
        setGameState(prev => {
            const nextRound: BettingRound =
                prev.bettingRound === 'pre-flop' ? 'flop' :
                prev.bettingRound === 'flop' ? 'turn' :
                prev.bettingRound === 'turn' ? 'river' : 'showdown';

            if (nextRound === 'showdown') {
                // End of betting, determine winner
                return { ...prev, bettingRound: 'showdown' };
            }

            const newCommunityCards = [...prev.communityCards];
            if (nextRound === 'flop') {
                newCommunityCards.push(prev.deck.pop()!, prev.deck.pop()!, prev.deck.pop()!);
            } else if (nextRound === 'turn' || nextRound === 'river') {
                newCommunityCards.push(prev.deck.pop()!);
            }

            const activePlayers = prev.players.filter(p => !p.hasFolded);
            const currentPlayerIndex = activePlayers.length > 0 ? prev.players.findIndex(p => p.id === activePlayers[0].id) : -1;

            return {
                ...prev,
                bettingRound: nextRound,
                communityCards: newCommunityCards,
                currentPlayerIndex,
                currentBet: 0,
                players: prev.players.map(p => ({...p, currentBet: 0})),
                messages: [...prev.messages, `--- Betting Round: ${nextRound.toUpperCase()} ---`],
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
                    // Can only check if currentBet is 0
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

            // Advance turn
            let nextPlayerIndex = (currentPlayerIndex + 1) % newPlayers.length;
            while (newPlayers[nextPlayerIndex].hasFolded || newPlayers[nextPlayerIndex].isAllIn) {
                nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
            }

            // Check if betting round is over
            const allActivePlayersHaveBet = activePlayers.every(p => p.currentBet === newCurrentBet || p.isAllIn);
            if(allActivePlayersHaveBet) {
                // advanceBettingRound();
                 return { ...prev, players: newPlayers, pot: newPot, currentBet: newCurrentBet, messages: [...prev.messages, message] };
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


    return {
        gameState,
        actions: {
            startNewGame,
            startRound,
            handlePlayerAction,
            advanceBettingRound
        }
    };
};
