import React, { useState, useMemo } from 'react'; 
import type { useBlackjackGame } from '../hooks/useBlackjackGame';
import BlackjackPlayerList from './BlackjackPlayerList';
import BlackjackPlayerHands from './BlackjackPlayerHands';
import ActionLog from '../../components/ActionLog';
import ActionPanel from '../../components/ActionPanel';
import TableSheet from '../../components/TableSheet';
import { END_GAME_CONFIRM } from '../../utils/archive';
import BlackjackDealerDisplay from './BlackjackDealerDisplay'; 
import BlackjackManageModal, { type ModalMode } from './BlackjackManageModal';
import { toTitleCase } from '../../utils/formatters';
import OwingsModal from '../../components/OwingsModal';
import type { Party } from '../../utils/owingsLogic';
import { emptyStats, sessionMinutes, summaryLines } from '../../utils/nightStats';
import { blackjackSettlement } from '../../utils/gameSettlement';
import StreamControls from '../../components/StreamControls';
import ActionToast from '../../components/ActionToast';
import Celebration from '../../components/Celebration';
import LogFeedback from '../../components/LogFeedback';
import { useWakeLock } from '../../hooks/useWakeLock';
import { readAppSettings } from '../../utils/appSettings';
import InteractionModal from '../../components/InteractionModal';
import SettingsFields from '../../components/SettingsFields';
import { parseBlackjack } from '../../utils/gameSettings';
import { BLACKJACK_FIELDS, toForm } from '../../utils/settingsFields';
import { blackjackSettingsOf } from '../engine';

interface BlackjackGameScreenProps {
    blackjackHook: ReturnType<typeof useBlackjackGame>;
    onInteractionChange: (isOpen: boolean) => void; 
    onShowSetupRequest: () => void; // ADDED
    isReadOnly?: boolean;
}

const BlackjackGameScreen: React.FC<BlackjackGameScreenProps> = ({ blackjackHook, onInteractionChange, onShowSetupRequest, isReadOnly = false }) => {
    const { gameState, actions, undo, canUndo } = blackjackHook;
    const { players, messages, gameStage, currentPlayerId, currentHandId, dealerNet, isBettingLocked } = gameState; // ADDED isBettingLocked

    const [modalMode, setModalMode] = useState<ModalMode>('none');
    useWakeLock(readAppSettings().keepAwake);
    const [showTable, setShowTable] = useState(false);
    const [showOwings, setShowOwings] = useState(false);
    const [parties, setParties] = useState<Party[]>([]);
    const [summary, setSummary] = useState<string[]>([]);
    const [settingsForm, setSettingsForm] = useState<Record<string, string> | null>(null);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const banker = players.find(p => p.id === gameState.bankerId);

    const openSettings = () => {
        if (isReadOnly) return;
        setSettingsForm(toForm(blackjackSettingsOf(gameState)));
        setSettingsError(null);
        onInteractionChange(true);
    };
    const closeSettings = () => {
        setSettingsForm(null);
        onInteractionChange(false);
    };
    const saveSettings = () => {
        const settings = parseBlackjack(settingsForm ?? {});
        if (typeof settings === 'string') return setSettingsError(settings);
        actions.applySettings(settings);
        closeSettings();
    };

    const handleShowModal = (mode: ModalMode) => {
        if (isReadOnly) return;
        setModalMode(mode);
        onInteractionChange(true);
    };

    const handleCloseModal = () => {
        setModalMode('none');
        onInteractionChange(false);
    };

    const handleShowOwings = () => {
        const { people, offBy, startedAt, parties } = blackjackSettlement(gameState);
        setParties(parties);
        setSummary(summaryLines(gameState.stats ?? emptyStats(), people, 'blackjack', false, offBy, { minutes: sessionMinutes(startedAt, Date.now()) }));
        setShowOwings(true);
        onInteractionChange(true);
    };

    const handleCloseOwings = () => {
        setShowOwings(false);
        onInteractionChange(false);
    };
    
    // --- ADDED: Handler for new button ---
    const handleShowSetup = () => {
        if (window.confirm(END_GAME_CONFIRM)) {
            actions.setupNewGame(); // 1. Clears the hook state
            onShowSetupRequest();   // 2. Tells lobby to change view
        }
    };

    // --- UPDATED LOGIC FOR BUTTON STATE ---
    const isDealDisabled = useMemo(() => {
        if (isBettingLocked) return true; // Disabled if bets are locked

        const activePlayers = players.filter(p => !p.isTakingBreak && p.initialHandsCount > 0 && p.id !== gameState.bankerId);
        if (activePlayers.length === 0) return true; // No one to deal to

        // Check if all hands have bets
        for (const player of activePlayers) {
            if (player.hands.length === 0) return true; // Hands not even created
            for (const hand of player.hands) {
                if (hand.bet <= 0) return true; // Found a hand with no bet
            }
        }
        
        return false; // All hands have bets
    }, [players, isBettingLocked, gameState.bankerId]);
    // --- END UPDATED LOGIC ---

    return (
        <>
            {isReadOnly ? <ActionToast messages={messages} /> : <LogFeedback messages={messages} />}
            <Celebration messages={messages} />
            <div className="blackjack-game-screen">
                <div className="player-list-container">
                    <BlackjackPlayerList players={players} gameState={gameState} />
                    <div className="blackjack-hands-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
                        {players.filter(p => !p.isTakingBreak).map(player => (
                            <div key={player.id} data-player-id={player.id} style={isReadOnly ? { pointerEvents: 'none' } : {}}>
                                <BlackjackPlayerHands
                                    player={player}
                                    isCurrentPlayer={player.id === currentPlayerId}
                                    currentHandId={currentHandId}
                                    gameStage={gameStage}
                                    isBettingLocked={isBettingLocked} 
                                    onPlaceBet={actions.placeBet}
                                    isBanker={player.id === gameState.bankerId}
                                    sideBets={gameState.sideBets}
                                    onPlaceSideBet={actions.placeSideBet}
                                    onSettleSideBet={actions.settleSideBet}
                                    onSetHandStatus={actions.setHandStatus}
                                    onUnlockBet={actions.unlockAllBets} 
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="main-content-container">
                    <div className="stage-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h2>{toTitleCase(gameStage)}</h2>
                        {isReadOnly && <div className="badge badge-warning" style={{ marginTop: '0.5rem' }}>SPECTATOR MODE</div>}
            
                        {!isReadOnly && <StreamControls gameState={gameState} gameType="blackjack" style={{ marginTop: '0.5rem' }} onHandedOver={actions.clearGame} />}
                        {!isReadOnly && canUndo && <button className="btn-sm btn-outline-secondary" style={{ marginTop: '0.5rem' }} onClick={undo}>↩ Undo</button>}
                    </div>

                    <BlackjackDealerDisplay dealerNet={dealerNet} />
                    {banker && <p style={{ textAlign: 'center' }}>Banker: <strong>{banker.name}</strong> ({(gameState.bankerRounds ?? 0) + 1} of {gameState.bankerEvery} rounds)</p>}

                    
                    {/* --- REMOVED "Settle Bets" button --- */}
                    {gameStage === 'dealer-turn' && (
                        <div className="game-controls-container">
                             <p style={{textAlign: 'center', fontSize: '1.2rem', color: 'var(--color-glow-yellow)'}}>
                                Settle all player hands (Win/Lose/Push/Bust/Blackjack).
                                <br />
                                The round will end automatically.
                             </p>
                             {!isReadOnly && players.some(p => p.hands.some(h => h.insurance && !h.insuranceResult)) && (
                                <div className="game-actions" style={{ justifyContent: 'center' }}>
                                    <span>Insurance: did the dealer have blackjack?</span>
                                    <button className="btn-success" onClick={() => actions.settleInsurance(true)}>Yes</button>
                                    <button className="btn-error" onClick={() => actions.settleInsurance(false)}>No</button>
                                </div>
                             )}
                        </div>
                    )}

                    <ActionLog messages={messages} />
                </div>
            </div>
            
            {!isReadOnly && (() => {
                const player = players.find(p => p.id === currentPlayerId);
                const handIndex = player?.hands.findIndex(h => h.id === currentHandId) ?? -1;
                const hand = player?.hands[handIndex];
                if (gameStage === 'player-turn' && player && hand) {
                    const act = (action: 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance') => () => actions.handlePlayerAction(action);
                    return <ActionPanel
                        info={<><strong>{player.name}</strong> · Hand {handIndex + 1} · Bet ₹{hand.wager}</>}
                        buttons={[
                            ...(gameState.allowSurrender ? [{ label: 'SURRENDER', onClick: act('surrender'), theme: 'btn-error', kind: 'fold' as const }] : []),
                            { label: 'DOUBLE', onClick: act('double'), theme: 'btn-accent' },
                            { label: 'SPLIT', onClick: act('split'), theme: 'btn-violet' },
                            ...(gameState.insurance ? [{ label: 'INSURANCE', onClick: act('insurance'), theme: 'btn-sky' }] : []),
                            { label: 'STAND', onClick: act('stand'), theme: 'btn-primary' },
                            { label: 'HIT', onClick: act('hit'), theme: 'btn-success', kind: 'primary' as const },
                        ]}
                    />;
                }
                if (gameStage === 'betting') {
                    return <ActionPanel
                        info={<>Between rounds · {isBettingLocked ? 'Bets locked to the last amounts' : 'Place a bet on every hand'}</>}
                        buttons={[
                            ...(isBettingLocked ? [{ label: 'CHANGE BETS', onClick: actions.unlockAllBets, theme: 'btn-orange' }] : []),
                            { label: 'ADD PLAYER', onClick: () => handleShowModal('addPlayer'), theme: 'btn-violet' },
                            { label: '☰ TABLE', onClick: () => setShowTable(true), theme: 'btn-sky' },
                            { label: isBettingLocked ? 'DEAL (SAME BETS)' : 'DEAL', onClick: actions.startRound, theme: 'btn-start rainbow-outline', kind: 'primary' as const, disabled: !isBettingLocked && isDealDisabled },
                        ]}
                    />;
                }
                return gameStage === 'dealer-turn' ? <ActionPanel info="Dealer's turn: settle every hand." buttons={[]} /> : null;
            })()}

            {showTable && (
                <TableSheet onClose={() => setShowTable(false)} groups={[
                    ['Players', [
                        { icon: '➕', label: 'Add player', onClick: () => handleShowModal('addPlayer') },
                        { icon: '➖', label: 'Remove player', onClick: () => handleShowModal('removePlayer') },
                        { icon: '☕', label: 'Break', onClick: () => handleShowModal('toggleBreak') },
                        { icon: '✋', label: 'Hands per player', onClick: () => handleShowModal('updateHands') },
                        { icon: '₹', label: 'Rebuy', onClick: () => handleShowModal('addChips') },
                    ]],
                    ['Money', [{ icon: '💰', label: 'Settlement', onClick: handleShowOwings }]],
                    ['Game', [
                        { icon: '⚙', label: 'Settings', onClick: openSettings },
                        { icon: '⏹', label: 'End game', danger: true, onClick: handleShowSetup },
                    ]],
                ]} />
            )}

            <BlackjackManageModal
                isOpen={modalMode !== 'none'}
                mode={modalMode}
                players={players}
                onClose={handleCloseModal}
                onAddPlayer={actions.addPlayer}
                onRemovePlayer={actions.removePlayer}
                onAddChips={actions.addChipsToPlayer}
                onToggleBreak={actions.togglePlayerBreak}
                onUpdateHands={actions.updatePlayerHandCount}
                defaultHands={gameState.defaultHands}
            />

            {settingsForm && (
                <InteractionModal isOpen={true} onClose={closeSettings} title="Settings" theme="default"
                    footerContent={<><button className="btn-modal btn-modal-secondary" onClick={closeSettings}>Cancel</button><button className="btn-modal btn-modal-primary theme-default" onClick={saveSettings}>Confirm</button></>} error={settingsError}>
                    <SettingsFields fields={BLACKJACK_FIELDS} form={settingsForm} onChange={setSettingsForm} />
                </InteractionModal>
            )}

            <OwingsModal
                isOpen={showOwings}
                onClose={handleCloseOwings}
                summary={summary}
                parties={parties}
                settleThrough={gameState.settleThrough}
                onSettleThrough={actions.setSettleThrough}
                game="blackjack"
            />
        </>
    );
};

export default BlackjackGameScreen;