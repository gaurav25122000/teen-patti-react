// src/poker/components/PokerGameScreen.tsx
import React, { useState, useEffect } from 'react';
import type { usePokerGame } from '../hooks/usePokerGame';
import PokerPlayerList from './PokerPlayerList';
import PokerPanel from './PokerPanel';
import ActionPanel from '../../components/ActionPanel';
import TableSheet from '../../components/TableSheet';
import { clockText, useTurnTimer } from '../../hooks/useTurnTimer';
import { END_GAME_CONFIRM } from '../../utils/archive';
import ActionLog from '../../components/ActionLog';
import InteractionModal from '../../components/InteractionModal';
import { useFormError } from '../../hooks/useFormError';
import OwingsModal from '../../components/OwingsModal';
import type { Party } from '../../utils/owingsLogic';
import { toTitleCase } from '../../utils/formatters';
import { emptyStats, sessionMinutes, summaryLines } from '../../utils/nightStats';
import { pokerSettlement } from '../../utils/gameSettlement';
import { clockLabel } from '../utils/blindLevels';
import { phoneInUse } from '../../utils/savedPlayers';
import StreamControls from '../../components/StreamControls';
import ActionToast from '../../components/ActionToast';
import Celebration from '../../components/Celebration';
import LogFeedback from '../../components/LogFeedback';
import { useWakeLock } from '../../hooks/useWakeLock';
import { readAppSettings } from '../../utils/appSettings';
import SettingsFields from '../../components/SettingsFields';
import { parsePoker } from '../../utils/gameSettings';
import { pokerFields, toForm } from '../../utils/settingsFields';
import { pokerSettingsOf } from '../engine';
import { formatAmount } from '../../utils/formatters';

interface PokerGameScreenProps {
    pokerHook: ReturnType<typeof usePokerGame>;
    onInteractionChange: (isOpen: boolean) => void;
    isReadOnly?: boolean;
}

type ModalMode = 'none' | 'addPlayer' | 'removePlayer' | 'addChips' | 'showdown' | 'owings' | 'toggleBreak' | 'streakWinnings' | 'settings' | 'addOn' | 'chop';

const PokerGameScreen: React.FC<PokerGameScreenProps> = ({ pokerHook, onInteractionChange, isReadOnly = false }) => {
    const { gameState, actions, autoAwardPot, undo, canUndo } = pokerHook;
    const { players, activePlayerIndex, messages, gameStage, pot } = gameState;

    const [modalMode, setModalMode] = useState<ModalMode>('none');
    const [formError, setFormError] = useFormError(modalMode);
    useWakeLock(readAppSettings().keepAwake);
    const [showTable, setShowTable] = useState(false);

    const [selectedWinnerIds, setSelectedWinnerIds] = useState<Set<number>>(new Set());

    const [managePlayerId, setManagePlayerId] = useState<string>('');
    const [addPlayerName, setAddPlayerName] = useState('');
    const [addPlayerStack, setAddPlayerStack] = useState('1000');
    const [addPlayerPhone, setAddPlayerPhone] = useState('');
    const [addChipsAmount, setAddChipsAmount] = useState('1000');
    const [streakAmount, setStreakAmount] = useState('50');
    const [parties, setParties] = useState<Party[]>([]);
    const [summary, setSummary] = useState<string[]>([]);
    const [owingsNotice, setOwingsNotice] = useState<string | undefined>();
    const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
    const tournament = !!gameState.entrants;
    const isOut = (id: number) => gameState.entrants?.find(e => e.id === id)?.place !== undefined;
    const hasAddOn = tournament ? !!gameState.addOnPrice : !!gameState.addOnAmount;
    const [now, setNow] = useState(() => Date.now());

    // The blind clock display ticks once a second while levels are on.
    useEffect(() => {
        if (!gameState.levelMinutes) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [gameState.levelMinutes]);
    const levelText = clockLabel(gameState, now);


    const currentPlayer = activePlayerIndex > -1 ? players[activePlayerIndex] : null;
    const betting = !!currentPlayer && gameStage !== 'pre-deal' && gameStage !== 'showdown';
    const nextHand = (gameState.handNumber ?? 0) + 1;
    const nextIsBomb = gameState.bombAmount !== undefined && (!!gameState.bombNext || (!!gameState.bombEvery && nextHand % gameState.bombEvery === 0));
    const timerLeft = useTurnTimer(isReadOnly ? undefined : gameState.turnTimer,
        betting ? `${gameState.handNumber ?? 0}:${gameStage}:${currentPlayer!.id}` : null, toTitleCase(currentPlayer?.name ?? ''));

    useEffect(() => {
        if (gameStage === 'showdown' && pot.length > 0) {
            const currentPot = pot[0];
            const eligiblePlayers = Array.from(currentPot.eligiblePlayers);

            if (eligiblePlayers.length === 1) {
                // GUARD: Only the host (active player) should trigger state changes.
                // Spectators should just observe the state provided by the stream.
                if (!isReadOnly) {
                    autoAwardPot(0, [eligiblePlayers[0]]);
                }
                
                if (modalMode === 'showdown') setModalMode('none');
            } else if (eligiblePlayers.length > 1) {
                // Pre-select all eligible players by default? Or none? Let's select none or the first.
                // Actually, if we want to allow splitting, let's start with empty or just the first.
                // Better UX: Pre-select all? No, usually one winner.
                setSelectedWinnerIds(new Set([eligiblePlayers[0]]));
                setModalMode('showdown');
            }
        } else if (gameStage !== 'showdown' && modalMode === 'showdown') {
            setModalMode('none');
        }
    }, [gameStage, pot, autoAwardPot, isReadOnly, modalMode]);

    useEffect(() => {
        const isModalOpen = modalMode !== 'none';
        onInteractionChange(isModalOpen);

        if (modalMode === 'showdown' && pot.length > 0 && pot[0].eligiblePlayers.size > 0) {
            // Already handled in the effect above, but ensuring consistency
             if (selectedWinnerIds.size === 0) {
                const eligible = Array.from(pot[0].eligiblePlayers);
                if (eligible.length > 0) setSelectedWinnerIds(new Set([eligible[0]]));
             }
        }
        if (modalMode === 'addOn') {
            // Only players still in are listed, so the default must be one of them.
            const listed = players.filter(p => gameState.entrants?.find(e => e.id === p.id)?.place === undefined);
            if (!listed.some(p => String(p.id) === managePlayerId)) setManagePlayerId(listed[0] ? String(listed[0].id) : '');
        } else if ((modalMode === 'removePlayer' || modalMode === 'addChips' || modalMode === 'toggleBreak' || modalMode === 'streakWinnings') && players.length > 0 && !managePlayerId) {
            setManagePlayerId(String(players[0].id));
        } else if (modalMode === 'addPlayer') {
            setManagePlayerId('');
            setAddPlayerName('');
            setAddPlayerStack('1000');
            setAddPlayerPhone('');
        }
    }, [modalMode, onInteractionChange, pot, players, managePlayerId, gameState.entrants]);

    const closeModal = () => {
        setModalMode('none');
    };

    const handleAwardPot = () => {
        if (selectedWinnerIds.size > 0) {
            actions.awardPot(0, Array.from(selectedWinnerIds));
        } else {
            setFormError("Please select at least one winner.");
        }
    };

    const toggleWinnerSelection = (id: number) => {
        const newSet = new Set(selectedWinnerIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedWinnerIds(newSet);
    };

    const handleShowOwings = () => {
        const { people, offBy, notice, tournament, startedAt, parties } = pokerSettlement(gameState);
        setParties(parties);
        setOwingsNotice(notice);
        setSummary(notice ? [] : summaryLines(gameState.stats ?? emptyStats(), people, 'poker', false, offBy, { tournament, minutes: sessionMinutes(startedAt, Date.now()) }));
        setModalMode('owings');
    };

    const handleManagePlayers = () => {
        switch (modalMode) {
            case 'addPlayer': {
                if (!addPlayerName.trim() || (!tournament && !addPlayerStack)) return setFormError("Please enter name and stack.");
                if (!/^\d{10}$/.test(addPlayerPhone.trim())) {
                    return setFormError('Please enter a valid 10-digit phone number.');
                }
                const taken = phoneInUse(players, addPlayerPhone);
                if (taken) return setFormError(taken);
                actions.addPlayer(addPlayerName, Number(addPlayerStack), addPlayerPhone.trim());
                break;
            }
            case 'removePlayer':
                if (!managePlayerId) return setFormError("Please select a player to remove.");
                actions.removePlayer(parseInt(managePlayerId, 10));
                setManagePlayerId('');
                break;
            case 'addChips':
                if (!managePlayerId) return setFormError("Please select a player.");
                actions.addChipsToPlayer(parseInt(managePlayerId, 10), Number(addChipsAmount));
                break;
            case 'toggleBreak':
                if (!managePlayerId) return setFormError("Please select a player.");
                actions.togglePlayerBreak(parseInt(managePlayerId, 10));
                break;
            case 'streakWinnings':
                if (!managePlayerId) return setFormError("Please select a player.");
                if (!streakAmount || Number(streakAmount) <= 0) return setFormError("Please enter a valid amount.");
                actions.applyStreakWinnings(parseInt(managePlayerId, 10), Number(streakAmount));
                break;
            case 'addOn':
                if (!managePlayerId) return setFormError("Please select a player.");
                actions.takeAddOn(parseInt(managePlayerId, 10));
                break;
            case 'settings': {
                const settings = parsePoker(settingsForm);
                if (typeof settings === 'string') return setFormError(settings);
                actions.applySettings(settings);
                break;
            }
            case 'chop':
                actions.chop();
                break;
        }
        closeModal();
    };

    const renderStageDisplay = () => (
        <div className="stage-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2>{toTitleCase(gameStage)}</h2>
            {isReadOnly && <div className="badge badge-warning" style={{ marginTop: '0.5rem' }}>SPECTATOR MODE</div>}
            
            {!isReadOnly && <StreamControls gameState={gameState} gameType="poker" style={{ marginTop: '0.5rem' }} onHandedOver={actions.clearGame} />}
            {!isReadOnly && canUndo && <button className="btn btn-secondary btn-compact" style={{ marginTop: '0.5rem' }} onClick={undo}>↩ Undo</button>}
            {levelText && (
                <div className="blind-clock">
                    <span>{levelText}</span>
                    {!isReadOnly && (gameState.pausedRemainingMs !== undefined
                        ? <button className="btn btn-success btn-compact" onClick={actions.resumeBlindClock}>RESUME</button>
                        : <button className="btn btn-orange btn-compact" onClick={actions.pauseBlindClock}>PAUSE</button>)}
                </div>
            )}
        </div>
    );

    const renderBustPrompt = () => {
        const id = gameState.bust?.awaiting[0];
        const player = players.find(p => p.id === id);
        if (isReadOnly || gameStage !== 'pre-deal' || !player || modalMode !== 'none') return null;
        const footer = <>
            <button className="btn-modal btn-modal-secondary" onClick={() => actions.bustChoice(player.id, false)}>OUT</button>
            <button className="btn-modal btn-modal-primary theme-default" onClick={() => actions.bustChoice(player.id, true)}>REBUY (₹{formatAmount(gameState.buyIn ?? 0)})</button>
        </>;
        return <InteractionModal isOpen={true} onClose={() => {}} title={`${toTitleCase(player.name)} is out of chips.`} theme="danger" footerContent={footer}>{null}</InteractionModal>;
    };

    const renderModal = () => {
        if (modalMode === 'none') return null;

        // Critical: If read-only, we should NOT show interactive game management modals.
        if (isReadOnly) {
            return null;
        }

        if (modalMode === 'owings') {
            return <OwingsModal isOpen={true} onClose={closeModal} summary={summary} notice={owingsNotice} parties={parties} game="poker"
                settleThrough={gameState.settleThrough} onSettleThrough={actions.setSettleThrough} />;
        }

        if (modalMode !== 'showdown') {
            let title = '';
            let body: React.ReactNode = null;
            let footer: React.ReactNode = null;
            let theme: 'default' | 'danger' = 'default';

            switch (modalMode) {
                case 'addPlayer':
                    title = "Add New Player";
                    body = <>
                        <div className="form-group"><label>Player Name</label><input type="text" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} /></div>
                        {tournament
                            ? <p>Buy-in ₹{formatAmount(gameState.buyIn ?? 0)} for {formatAmount(gameState.startingChips ?? 0)} chips.</p>
                            : <div className="form-group"><label>Starting Stack</label><input type="number" inputMode="decimal" value={addPlayerStack} onChange={e => setAddPlayerStack(e.target.value)} /></div>}
                        <div className="form-group"><label>Phone Number</label><input type="tel" value={addPlayerPhone} onChange={e => setAddPlayerPhone(e.target.value)} placeholder="10 digits" /></div>
                    </>;
                    break;
                case 'removePlayer':
                    title = "Remove Player";
                    theme = 'danger';
                    body = <div className="form-group"><label>Select Player to Remove</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>;
                    break;
                case 'addChips':
                    title = "Add Chips (Rebuy/Add-on)";
                    body = <>
                        <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div className="form-group"><label>Amount to Add</label><input type="number" inputMode="decimal" value={addChipsAmount} onChange={e => setAddChipsAmount(e.target.value)} /></div>
                    </>;
                    break;
                case 'toggleBreak':
                    title = "Break";
                    body = <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{toTitleCase(p.name)} ({p.isTakingBreak ? "On Break" : "Active"})</option>)}</select></div>;
                    break;
                case 'streakWinnings':
                    title = "Give Streak Winnings";
                    body = <>
                        <div className="form-group"><label>Select Winner</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div className="form-group"><label>Amount (from each other player)</label><input type="number" inputMode="decimal" value={streakAmount} onChange={e => setStreakAmount(e.target.value)} /></div>
                        <p className="text-muted" style={{ fontSize: '0.9em', marginTop: '10px' }}>This will deduct ₹{streakAmount} from everyone else and add the total to the selected player.</p>
                    </>;
                    break;
                case 'addOn':
                    title = "Add-on";
                    body = <>
                        <div className="form-group"><label>Select Player</label><select value={managePlayerId} onChange={e => setManagePlayerId(e.target.value)}>{players.filter(p => !isOut(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <p>{tournament ? `₹${formatAmount(gameState.addOnPrice ?? 0)} for ${formatAmount(gameState.addOnChips ?? 0)} chips.` : `₹${formatAmount(gameState.addOnAmount ?? 0)}.`}</p>
                    </>;
                    break;
                case 'settings':
                    title = "Settings";
                    body = <SettingsFields fields={pokerFields(tournament)} form={settingsForm} onChange={setSettingsForm} />;
                    break;
                case 'chop':
                    title = "CHOP";
                    theme = 'danger';
                    body = <p>Chop now? Players still in split the rest of the pool by chips.</p>;
                    break;
            }

            footer = <><button className="btn-modal btn-modal-secondary" onClick={closeModal}>Cancel</button><button className={`btn-modal btn-modal-primary theme-${theme}`} onClick={handleManagePlayers}>Confirm</button></>;

            return <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} footerContent={footer} error={formError}>{body}</InteractionModal>;
        }

        const currentPot = pot[0];
        if (!currentPot) return null;
        const eligiblePlayers = players.filter(p => currentPot.eligiblePlayers.has(p.id));
        
        // Disable Award Pot modal for spectators
        if (isReadOnly) return null;
        
        if (eligiblePlayers.length <= 1) return null;

        const title = `Awarding Pot (${currentPot.amount})`;
        const theme = 'success';
        const body = <div className="form-group">
            <label style={{ marginBottom: '12px', display: 'block', fontWeight: 'bold' }}>Select Winner(s) to Split Pot</label>
            <div className="winner-selection-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eligiblePlayers.map(p => {
                    const isSelected = selectedWinnerIds.has(p.id);
                    return (
                        <label key={p.id} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            cursor: 'pointer', 
                            padding: '12px', 
                            background: isSelected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)', 
                            border: isSelected ? '1px solid #4CAF50' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease'
                        }}>
                            <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => toggleWinnerSelection(p.id)}
                                style={{ transform: 'scale(1.2)', cursor: 'pointer', width: 'auto', margin: 0 }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: '500', fontSize: '1.05em' }}>{toTitleCase(p.name)}</span>
                            </div>
                        </label>
                    );
                })}
            </div>
            {selectedWinnerIds.size > 1 && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.95em', color: '#aaa' }}>Pot Total: <strong style={{ color: '#fff' }}>₹{formatAmount(currentPot.amount)}</strong></p>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', color: '#4CAF50' }}>Split: ₹{formatAmount(Math.floor(currentPot.amount / selectedWinnerIds.size))} each</p>
                </div>
            )}
        </div>;
        const footer = <button className="btn-modal btn-modal-primary theme-success" onClick={handleAwardPot}>Award Pot to Winner</button>;

        return <InteractionModal isOpen={true} onClose={closeModal} title={title} theme={theme} footerContent={footer} error={formError}>{body}</InteractionModal>;
    }

    return (
        <>
            {isReadOnly ? <ActionToast messages={messages} /> : <LogFeedback messages={messages} />}
            <Celebration messages={messages} />
            <div className="game-screen">
                <div className="player-list-container">
                    <PokerPlayerList players={players} gameState={gameState} />
                    {renderStageDisplay()}
                    {gameStage !== 'pre-deal' && (
                        <div className="pot-display">
                            <h2>Total Pot: ₹ {formatAmount(players.reduce((sum, p) => sum + p.totalPotContribution, 0))}</h2>
                        </div>
                    )}
                </div>
                <div className="main-content-container">
                    <ActionLog messages={messages} />
                </div>
            </div>
            {!isReadOnly && (betting ? (
                <PokerPanel
                    key={`${gameState.handNumber ?? 0}:${gameStage}:${currentPlayer!.id}:${gameState.currentBet}`}
                    gameState={gameState}
                    currentPlayer={currentPlayer!}
                    timer={timerLeft === null ? null : clockText(timerLeft)}
                    onAction={actions.handlePlayerAction}
                />
            ) : gameStage === 'pre-deal' && !gameState.bust?.awaiting.length && (
                <ActionPanel
                    info={<>Between hands · Blinds ₹{formatAmount(gameState.smallBlindAmount)}/₹{formatAmount(gameState.bigBlindAmount)}{gameState.bombNext ? ' · Next hand is a bomb pot' : ''}</>}
                    buttons={[
                        { label: 'ADD PLAYER', onClick: () => setModalMode('addPlayer'), theme: 'btn-violet' },
                        { label: '☰ TABLE', onClick: () => setShowTable(true), theme: 'btn-sky' },
                        { label: nextIsBomb ? 'DEAL BOMB POT' : 'DEAL', onClick: actions.startNewHand, theme: 'btn-start rainbow-outline', kind: 'primary' },
                    ]}
                />
            ))}

            {showTable && (
                <TableSheet onClose={() => setShowTable(false)} groups={[
                    ['Players', [
                        { icon: '➕', label: 'Add player', onClick: () => setModalMode('addPlayer') },
                        { icon: '➖', label: 'Remove player', onClick: () => setModalMode('removePlayer') },
                        { icon: '☕', label: 'Break', onClick: () => setModalMode('toggleBreak') },
                        ...(tournament ? [] : [{ icon: '₹', label: 'Rebuy', onClick: () => setModalMode('addChips') }]),
                        ...(hasAddOn && !gameState.tournamentOver ? [{ icon: '＋', label: 'Add-on', onClick: () => setModalMode('addOn') }] : []),
                    ]],
                    ['Money', [
                        { icon: '💰', label: 'Settlement', onClick: handleShowOwings },
                        ...(tournament ? [] : [{ icon: '🔥', label: 'Streak winnings', onClick: () => setModalMode('streakWinnings') }]),
                    ]],
                    ['Game', [
                        { icon: '⚙', label: 'Settings', onClick: () => { setSettingsForm(toForm(pokerSettingsOf(gameState))); setModalMode('settings'); } },
                        ...(gameState.bombAmount !== undefined ? [{ icon: '💣', label: `Bomb pot next hand: ${gameState.bombNext ? 'On' : 'Off'}`, onClick: actions.toggleBombNext }] : []),
                        ...(tournament && !gameState.tournamentOver ? [{ icon: '✂', label: 'Chop', onClick: () => setModalMode('chop') }] : []),
                        { icon: '⏹', label: 'End game', danger: true, onClick: () => { if (window.confirm(END_GAME_CONFIRM)) actions.endGame(); } },
                    ]],
                ]} />
            )}

            {renderModal()}
            {renderBustPrompt()}
        </>
    );
};

export default PokerGameScreen;