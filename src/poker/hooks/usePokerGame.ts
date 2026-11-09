// src/poker/hooks/usePokerGame.ts
import { useEffect, useCallback, useMemo } from 'react';
import type { PokerGameState } from '../types/pokerGameTypes';
import { withClock } from '../utils/blindLevels';
import { useUndo } from '../../hooks/useUndo';
import { useGameState } from '../../hooks/useGameState';
import { useEngineIo } from '../../hooks/useEngineIo';
import { pokerSettlement } from '../../utils/gameSettlement';
import { archiveOrWarn } from '../../utils/archive';
import { rememberPlayers } from '../../utils/savedPlayers';
import { toTitleCase } from '../../utils/formatters';
import * as engine from '../engine';
import type { Io } from '../../utils/engine';

export const POKER_STORAGE_KEY = 'pokerGameState';

// Poker does not load its save on launch, so a new game set up over it archives the saved copy.
const storedPoker = (): PokerGameState | null => {
    try {
        const saved = localStorage.getItem(POKER_STORAGE_KEY);
        return saved ? engine.restorePoker(JSON.parse(saved)) : null;
    } catch {
        return null;
    }
};

export const usePokerGame = () => {
    const [gameState, setGameState, addMessage, afterCommit] = useGameState<PokerGameState>(engine.createInitialPokerState);
    const { record, unrecorded, undo: undoStep, canUndo } = useUndo(gameState, setGameState, gameState.gameStage !== 'pre-deal');
    const io = useEngineIo(addMessage, afterCommit, 'poker');
    const step = useCallback((fn: (s: PokerGameState, io: Io) => PokerGameState) => setGameState(prev => fn(prev, io)), [setGameState, io]);

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
            setGameState(engine.restorePoker(JSON.parse(savedState)));
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

    const setupGame = useCallback((players: { name: string, stack: number, phoneNumber: string }[], blinds: { sb: number, bb: number }, levelMinutes?: number) => {
        const next = engine.newPokerGame(players, blinds, levelMinutes, Date.now());
        setGameState(prev => {
            const previous = prev.players.length > 0 ? prev : storedPoker();
            afterCommit(() => { if (previous) archiveOrWarn('poker', previous.stats, pokerSettlement(previous)); });
            return next;
        });
        const full = rememberPlayers(next.players.map(p => ({ name: p.name, phone: p.phoneNumber })));
        if (full) addMessage(full);
    }, [setGameState, afterCommit, addMessage]);

    const handlePlayerAction = useCallback((action: engine.PlayerAction, amount = 0) => step((s, io) => engine.playerAction(s, action, amount, io)), [step]);
    const startNewHand = useCallback(() => step((s, io) => engine.startNewHand(s, io)), [step]);
    const awardPot = useCallback((potIndex: number, winnerIds: number[]) => step((s, io) => engine.awardPot(s, potIndex, winnerIds, io)), [step]);

    const addPlayer = useCallback((name: string, stack: number, phoneNumber: string) => {
        if (!name || stack < 0) return;
        setGameState(prev => {
            const next = engine.addPlayer(prev, name, stack, phoneNumber, io);
            if (next !== prev) {
                afterCommit(() => {
                    const full = rememberPlayers([{ name: toTitleCase(name), phone: phoneNumber }]);
                    if (full) addMessage(full);
                });
            }
            return next;
        });
    }, [setGameState, io, afterCommit, addMessage]);

    const removePlayer = useCallback((playerId: number) => step((s, io) => engine.removePlayer(s, playerId, io)), [step]);
    const addChipsToPlayer = useCallback((playerId: number, amount: number) => step((s, io) => engine.addChipsToPlayer(s, playerId, amount, io)), [step]);
    const togglePlayerBreak = useCallback((playerId: number) => step((s, io) => engine.togglePlayerBreak(s, playerId, io)), [step]);
    const applyStreakWinnings = useCallback((winnerId: number, amount: number) => step((s, io) => engine.applyStreakWinnings(s, winnerId, amount, io)), [step]);
    const pauseBlindClock = useCallback(() => setGameState(prev => engine.pauseBlindClock(prev, Date.now())), [setGameState]);
    const resumeBlindClock = useCallback(() => setGameState(prev => engine.resumeBlindClock(prev, Date.now())), [setGameState]);

    // Empties the game and its saved copy (used after handing the game to another phone).
    const clearGame = useCallback(() => {
        localStorage.removeItem(POKER_STORAGE_KEY);
        setGameState(engine.createInitialPokerState());
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
