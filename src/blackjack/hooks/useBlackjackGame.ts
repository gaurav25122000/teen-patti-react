// src/blackjack/hooks/useBlackjackGame.ts
import { useEffect, useCallback, useMemo } from 'react';
import type { BlackjackGameState, HandStatus } from '../types/blackjackGameTypes';
import { toTitleCase } from '../../utils/formatters';
import { useUndo } from '../../hooks/useUndo';
import { useGameState } from '../../hooks/useGameState';
import { useEngineIo } from '../../hooks/useEngineIo';
import { blackjackSettlement } from '../../utils/gameSettlement';
import { archiveOrWarn } from '../../utils/archive';
import { rememberPlayers } from '../../utils/savedPlayers';
import * as engine from '../engine';
import type { Io } from '../../utils/engine';
import type { BlackjackSettings } from '../../utils/gameSettings';
import type { SideResult } from '../types/blackjackGameTypes';

export const BLACKJACK_STORAGE_KEY = 'blackjackGameState';

const archiveBlackjack = (state: BlackjackGameState) => archiveOrWarn('blackjack', state.stats, blackjackSettlement(state));

const loadStateFromStorage = (): BlackjackGameState | null => {
    try {
        const savedState = localStorage.getItem(BLACKJACK_STORAGE_KEY);
        return savedState ? engine.restoreBlackjack(JSON.parse(savedState)) : null;
    } catch {
        localStorage.removeItem(BLACKJACK_STORAGE_KEY);
        return null;
    }
};

export const useBlackjackGame = () => {
    const [gameState, setGameState, addMessage, afterCommit] = useGameState<BlackjackGameState>(() => {
        return loadStateFromStorage() || engine.createInitialBlackjackState();
    }, engine.roundMoney);
    const { record, undo, canUndo } = useUndo(gameState, setGameState, gameState.gameStage !== 'betting');
    const io = useEngineIo(addMessage, afterCommit, 'blackjack');
    const step = useCallback((fn: (s: BlackjackGameState, io: Io) => BlackjackGameState) => setGameState(prev => fn(prev, io)), [setGameState, io]);

    const loadGame = useCallback(() => {
        const loadedState = loadStateFromStorage();
        if (loadedState) {
            setGameState(loadedState);
            addMessage("Saved game loaded.");
            return true;
        }
        addMessage("No saved game found.");
        return false;
    }, [addMessage, setGameState]);

    useEffect(() => {
        if (gameState.players.length > 0) {
            localStorage.setItem(BLACKJACK_STORAGE_KEY, JSON.stringify(gameState));
        } else {
            localStorage.removeItem(BLACKJACK_STORAGE_KEY);
        }
    }, [gameState]);

    // Ends the game: it goes to History, and setup starts fresh.
    const setupNewGame = useCallback(() => {
        setGameState(prev => {
            afterCommit(() => archiveBlackjack(prev));
            return engine.createInitialBlackjackState();
        });
    }, [setGameState, afterCommit]);

    // Empties the game without saving it to history (used after handing the game to another phone).
    const clearGame = useCallback(() => {
        setGameState(engine.createInitialBlackjackState());
    }, [setGameState]);

    const setupGame = useCallback((players: { name: string, stack: number, phoneNumber: string, numHands: number }[], settings: BlackjackSettings) => {
        const next = engine.newBlackjackGame(players, settings, Date.now());
        setGameState(prev => {
            afterCommit(() => archiveBlackjack(prev));
            return next;
        });
        const full = rememberPlayers(next.players.map(p => ({ name: p.name, phone: p.phoneNumber })));
        if (full) addMessage(full);
    }, [setGameState, afterCommit, addMessage]);

    const placeBet = useCallback((playerId: number, handIndex: number, amount: number) => step((s, io) => engine.placeBet(s, playerId, handIndex, amount, io)), [step]);
    const startRound = useCallback(() => step((s, io) => engine.startRound(s, io)), [step]);
    const handlePlayerAction = useCallback((action: engine.HandAction) => step((s, io) => engine.playerAction(s, action, io)), [step]);
    const setHandStatus = useCallback((playerId: number, handId: string, status: HandStatus) => step((s, io) => engine.setHandStatus(s, playerId, handId, status, io)), [step]);
    const settleInsurance = useCallback((dealerHasBlackjack: boolean) => step((s, io) => engine.settleInsurance(s, dealerHasBlackjack, io)), [step]);

    const addPlayer = useCallback((name: string, stack: number, phoneNumber: string, numHands: number) => {
        if (!name || stack < 0 || numHands < 1) return;
        setGameState(prev => {
            const next = engine.addPlayer(prev, name, stack, phoneNumber, numHands, io);
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
    const updatePlayerHandCount = useCallback((playerId: number, numHands: number) => step((s, io) => engine.updatePlayerHandCount(s, playerId, numHands, io)), [step]);
    const unlockAllBets = useCallback(() => step((s, io) => engine.unlockAllBets(s, io)), [step]);
    const applySettings = useCallback((settings: BlackjackSettings) => step((s, io) => engine.applySettings(s, settings, io)), [step]);
    const placeSideBet = useCallback((playerId: number, handIndex: number, kind: engine.SideKind, amount: number) =>
        step((s, io) => engine.placeSideBet(s, playerId, handIndex, kind, amount, io)), [step]);
    const settleSideBet = useCallback((playerId: number, handId: string, kind: engine.SideKind, result: SideResult) =>
        step((s, io) => engine.settleSideBet(s, playerId, handId, kind, result, io)), [step]);

    const actions = useMemo(() => ({
        setupNewGame,
        clearGame,
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
        settleInsurance,
        applySettings,
        placeSideBet,
        settleSideBet,
    }), [setupNewGame, clearGame, setupGame, loadGame, placeBet, startRound, handlePlayerAction, setHandStatus,
        addPlayer, removePlayer, addChipsToPlayer, togglePlayerBreak, updatePlayerHandCount, unlockAllBets, settleInsurance,
        applySettings, placeSideBet, settleSideBet]);

    // Final Owings' picker: kept with the game (and its History entry), not an undo step.
    const setSettleThrough = useCallback((label: string | null) => setGameState(s => ({ ...s, settleThrough: label })), [setGameState]);
    const recordedActions = useMemo(() => ({ ...record(actions), setSettleThrough }), [record, actions, setSettleThrough]);

    return { gameState, actions: recordedActions, undo, canUndo };
};
