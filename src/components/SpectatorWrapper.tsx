import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpectate } from '../hooks/useSpectate';
import { derivePlayers } from '../hooks/useTeenPattiGame';
import PokerGameScreen from '../poker/components/PokerGameScreen';
import GameScreen from './GameScreen';
import BlackjackGameScreen from '../blackjack/components/BlackjackGameScreen';


const SpectatorWrapper: React.FC = () => {
    const { streamId } = useParams<{ streamId: string }>();
    const { gameState, connectionStatus } = useSpectate(streamId);

    if (connectionStatus === 'connecting') {
        return (
            <div className="spectator-loading">
                <h2>Connecting to Stream...</h2>
                <div className="spinner"></div>
            </div>
        );
    }

    if (connectionStatus === 'error' || connectionStatus === 'disconnected') {
        return (
            <div className="spectator-error">
                <h2>Stream Unavailable</h2>
                <p>The stream has ended or the connection failed.</p>
                <Link to="/" className="btn-primary">Go Home</Link>
            </div>
        );
    }

    if (!gameState) {
        return (
            <div className="spectator-loading">
                <h2>Waiting for Game State...</h2>
            </div>
        );
    }

    // Determine which game to render based on gameType
    // We expect the host to include 'gameType' in the broadcasted state
    const { gameType, ...actualState } = gameState;

    // We need to adapt the props for read-only mode
    // The hooks usually return { gameState, actions }. 
    // In spectator mode, we don't have a real hook instance.
    // We can construct a "mock hook" object that returns the state from the stream
    // and dummy actions.

    const mockAction = () => console.log('Spectator action ignored');

    if (gameType === 'poker') {
        const mockPokerHook = {
            gameState: actualState,
            actions: {
                startNewGame: mockAction,
                loadGame: mockAction,
                sitDown: mockAction,
                standUp: mockAction,
                startGame: mockAction,
                fold: mockAction,
                check: mockAction,
                call: mockAction,
                raise: mockAction,
                nextRound: mockAction,
                endHand: mockAction,
                buyIn: mockAction,
                updateBlind: mockAction,
                awardPot: mockAction, // Added missing mock
                addPlayer: mockAction,
                removePlayer: mockAction,
                addChipsToPlayer: mockAction,
                togglePlayerBreak: mockAction,
                applyStreakWinnings: mockAction,
            }
        };
        // @ts-ignore - We are mocking the hook
        return <PokerGameScreen pokerHook={mockPokerHook} onInteractionChange={() => {}} isReadOnly={true} />;
    }

    if (gameType === 'teen-patti') {
        const mockTeenPattiHook = {
            gameState: actualState,
            ...derivePlayers(actualState),
            actions: {
                startNewGame: mockAction,
                loadGame: mockAction,
                startRound: mockAction,
                playBlind: mockAction,
                seeCards: mockAction,
                betChaal: mockAction,
                fold: mockAction,
                requestShow: mockAction,
                resolveShow: mockAction,
                addPlayer: mockAction,
                removePlayer: mockAction,
                reorderPlayers: mockAction,
                updateEntities: mockAction,
                updatePlayers: mockAction,
                deductAndDistribute: mockAction,
                addChipsToPlayer: mockAction,
                togglePlayerBreak: mockAction,
                endRound: mockAction,
            }
        };
        // @ts-ignore
        return <GameScreen gameHook={mockTeenPattiHook} onShowSetup={() => {}} isReadOnly={true} />;
    }

    if (gameType === 'blackjack') {
         const mockBlackjackHook = {
            gameState: actualState,
             actions: {
                 setupGame: mockAction,
                 loadGame: mockAction,
                 placeBet: mockAction,
                 deal: mockAction,
                 hit: mockAction,
                 stand: mockAction,
                 doubleDown: mockAction,
                 split: mockAction,
                 surrender: mockAction,
                 insurance: mockAction,
                 nextHand: mockAction,
                 settleDealer: mockAction,
                 resetGame: mockAction,
                 updateBalance: mockAction,
                 setupNewGame: mockAction,
                 addPlayer: mockAction,
                 removePlayer: mockAction,
                 addChipsToPlayer: mockAction,
                 togglePlayerBreak: mockAction,
                 changeHandCount: mockAction,
             }
         };

         // @ts-ignore
         return <BlackjackGameScreen blackjackHook={mockBlackjackHook} onInteractionChange={() => {}} onShowSetupRequest={() => {}} isReadOnly={true} />;
    }

    return <div>Unknown Game Type: {gameType}</div>;
};

export default SpectatorWrapper;
