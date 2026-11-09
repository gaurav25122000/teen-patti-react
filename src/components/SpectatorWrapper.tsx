import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpectate } from '../hooks/useSpectate';
import { derivePlayers } from '../hooks/useTeenPattiGame';
import { useStoredState } from '../hooks/useStoredState';
import { POKER_STORAGE_KEY } from '../poker/hooks/usePokerGame';
import { BLACKJACK_STORAGE_KEY } from '../blackjack/hooks/useBlackjackGame';
import { LOCAL_STORAGE_KEY } from '../constants/gameConstants';
import { toTitleCase } from '../utils/formatters';
import { rehydrateState } from '../utils/serialization';
import { archiveOrWarn } from '../utils/archive';
import { blackjackSettlement, pokerSettlement, teenPattiSettlement } from '../utils/gameSettlement';
import type { GameKind } from '../utils/nightStats';
import PokerGameScreen from '../poker/components/PokerGameScreen';
import GameScreen from './GameScreen';
import BlackjackGameScreen from '../blackjack/components/BlackjackGameScreen';
import InteractionModal from './InteractionModal';

// Where a handed-over game is saved and opened on the new host's phone.
const GAMES: Record<string, { route: string; storageKey: string; label: string }> = {
    'teen-patti': { route: '/teen-patti', storageKey: LOCAL_STORAGE_KEY, label: 'Teen Patti' },
    poker: { route: '/poker', storageKey: POKER_STORAGE_KEY, label: 'Poker' },
    blackjack: { route: '/blackjack', storageKey: BLACKJACK_STORAGE_KEY, label: 'Blackjack' },
};

const SETTLEMENTS = { 'teen-patti': teenPattiSettlement, poker: pokerSettlement, blackjack: blackjackSettlement };

// Taking a game over replaces this phone's own saved game of that type, so that one goes to History first.
const archiveReplaced = (kind: GameKind, previous: string | null) => {
    if (!previous) return;
    try {
        const old = rehydrateState(JSON.parse(previous));
        if (!Array.isArray(old?.players)) return;
        archiveOrWarn(kind, old.stats, SETTLEMENTS[kind](old));
    } catch (err) {
        console.error('Could not archive the replaced game:', err);
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stream state is untyped across three games
const currentTurnId = (state: any): number | null => {
    if (state.gameType === 'teen-patti') return derivePlayers(state).currentPlayer?.id ?? null;
    if (state.gameType === 'poker') {
        const live = state.activePlayerIndex > -1 && state.gameStage !== 'pre-deal' && state.gameStage !== 'showdown';
        return live ? state.players[state.activePlayerIndex]?.id ?? null : null;
    }
    if (state.gameType === 'blackjack') return state.gameStage === 'player-turn' ? state.currentPlayerId : null;
    return null;
};

const SpectatorWrapper: React.FC = () => {
    const { streamId } = useParams<{ streamId: string }>();
    const { gameState, connectionStatus, handoverOffer, clearHandoverOffer, hostMovedTo, handoverConfirmed, send } = useSpectate(streamId);
    const [viewerName, setViewerName] = useStoredState('viewerName', '');
    const [handoverError, setHandoverError] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    // What this phone had saved before accepting, restored if the host never confirms.
    const acceptedRef = useRef<{ kind: GameKind; storageKey: string; previous: string | null; route: string } | null>(null);

    // Player view: the viewer picks who they are; ids come from the host, so coerce before use in CSS.
    const players: { id: number; name: string; balance?: number; stack?: number }[] = Array.isArray(gameState?.players) ? gameState.players : [];
    const me = players.find(p => p.name === viewerName) ?? null;
    const myId = me && Number.isFinite(Number(me.id)) ? Number(me.id) : null;
    const isMyTurn = myId !== null && gameState !== null && currentTurnId(gameState) === myId;

    useEffect(() => {
        if (connectionStatus === 'connected') send({ type: 'viewer-name', name: me?.name ?? null });
    }, [connectionStatus, me?.name, send]);

    useEffect(() => {
        if (isMyTurn) navigator.vibrate?.([200, 100, 200]);
    }, [isMyTurn]);

    const replyToHandover = (accepted: boolean, error?: string) => {
        send({ type: 'handover-reply', accepted });
        clearHandoverOffer();
        setHandoverError(error ?? null);
    };

    const acceptHandover = () => {
        const game = handoverOffer && GAMES[String(handoverOffer.gameType)];
        if (!handoverOffer || !game || !Array.isArray(handoverOffer.players)) {
            replyToHandover(false, 'That game could not be taken over.');
            return;
        }
        const saved = { ...handoverOffer };
        delete saved.gameType;
        try {
            acceptedRef.current = { kind: handoverOffer.gameType as GameKind, storageKey: game.storageKey, previous: localStorage.getItem(game.storageKey), route: game.route };
            localStorage.setItem(game.storageKey, JSON.stringify(saved));
        } catch {
            acceptedRef.current = null;
            replyToHandover(false, "This phone can't save the game (storage is blocked).");
            return;
        }
        replyToHandover(true);
        setLeaving(true);
    };

    // Move only once the host confirms; a host that cancelled meanwhile never does.
    useEffect(() => {
        if (!handoverConfirmed || !acceptedRef.current) return;
        archiveReplaced(acceptedRef.current.kind, acceptedRef.current.previous);
        window.location.assign(`${acceptedRef.current.route}?host=1`);
    }, [handoverConfirmed]);

    useEffect(() => {
        if (!leaving) return;
        const timer = setTimeout(() => {
            const accepted = acceptedRef.current;
            acceptedRef.current = null;
            if (accepted) {
                try {
                    if (accepted.previous === null) localStorage.removeItem(accepted.storageKey);
                    else localStorage.setItem(accepted.storageKey, accepted.previous);
                } catch { /* storage blocked: nothing was written */ }
            }
            setLeaving(false);
            setHandoverError("The host didn't confirm the hand over. Nothing changed on this phone.");
        }, 30_000);
        return () => clearTimeout(timer);
    }, [leaving]);

    const offeredGame = handoverOffer ? GAMES[String(handoverOffer.gameType)] : undefined;
    const withViewerUi = (screen: React.ReactNode) => (
        <>
            <div className="viewer-bar">
                <label>
                    Watching as{' '}
                    <select value={me ? me.name : ''} onChange={e => setViewerName(e.target.value)}>
                        <option value="">Just watching</option>
                        {players.map(p => <option key={p.id} value={p.name}>{toTitleCase(p.name)}</option>)}
                    </select>
                </label>
                {me && <span className="viewer-balance">You: ₹{me.balance ?? me.stack}</span>}
            </div>
            {isMyTurn && <div className="your-turn-banner" role="status">Your turn!</div>}
            {myId !== null && <style>{`[data-player-id="${myId}"] { outline: 2px solid var(--color-glow-lime); outline-offset: -2px; }`}</style>}
            {screen}
            {handoverOffer && (
                <InteractionModal
                    isOpen={true}
                    onClose={() => replyToHandover(false)}
                    title="Take over as host?"
                    theme="confirmation"
                    footerContent={<>
                        <button className="btn-modal btn-modal-secondary" onClick={() => replyToHandover(false)}>No thanks</button>
                        <button className="btn-modal btn-modal-primary" onClick={acceptHandover}>Take over</button>
                    </>}
                >
                    <p>The host wants to hand this {offeredGame?.label ?? ''} game to your phone. It replaces any saved {offeredGame?.label ?? ''} game here, and you'll get a new stream link to share.</p>
                </InteractionModal>
            )}
            {handoverError && (
                <InteractionModal isOpen={true} onClose={() => setHandoverError(null)} title="Hand over failed" theme="danger" footerContent={null}>
                    <p>{handoverError}</p>
                </InteractionModal>
            )}
        </>
    );

    if (leaving) {
        return (
            <div className="spectator-loading">
                <h2>Waiting for the host to confirm...</h2>
            </div>
        );
    }

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
                <p>{hostMovedTo
                    ? `Hosting moved to ${toTitleCase(hostMovedTo)}'s phone. Ask them for the new stream link.`
                    : 'The stream has ended or the connection failed.'}</p>
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
        return withViewerUi(<PokerGameScreen pokerHook={mockPokerHook} onInteractionChange={() => {}} isReadOnly={true} />);
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
        return withViewerUi(<GameScreen gameHook={mockTeenPattiHook} onShowSetup={() => {}} isReadOnly={true} />);
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
         return withViewerUi(<BlackjackGameScreen blackjackHook={mockBlackjackHook} onInteractionChange={() => {}} onShowSetupRequest={() => {}} isReadOnly={true} />);
    }

    return <div>Unknown Game Type: {gameType}</div>;
};

export default SpectatorWrapper;
