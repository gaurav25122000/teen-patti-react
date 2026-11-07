import React, { useState, useMemo } from 'react'; 
import type { useBlackjackGame } from '../hooks/useBlackjackGame';
import BlackjackPlayerList from './BlackjackPlayerList';
import BlackjackPlayerHands from './BlackjackPlayerHands';
import ActionLog from '../../components/ActionLog';
import BlackjackGameControls from './BlackjackGameControls'; 
import BlackjackDealerDisplay from './BlackjackDealerDisplay'; 
import BlackjackManageModal, { type ModalMode } from './BlackjackManageModal';
import { toTitleCase } from '../../utils/formatters';
import OwingsModal from '../../components/OwingsModal';
import { calculateOwings, type Transaction } from '../../utils/owingsLogic';
import StreamControls from '../../components/StreamControls';
import ActionToast from '../../components/ActionToast';
import Celebration from '../../components/Celebration';

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
    const [showOwings, setShowOwings] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

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
        const dealerAsPlayer = {
          name: 'Dealer (House)',
          stack: gameState.dealerNet, 
          totalBuyIn: 0,              
          id: 9999,                   
          balance: undefined,
          entityId: undefined,
          phoneNumber: undefined,
          isTakingBreak: false,
        };
        
        setTransactions(calculateOwings([...players, dealerAsPlayer], [])); 
        setShowOwings(true);
        onInteractionChange(true);
    };

    const handleCloseOwings = () => {
        setShowOwings(false);
        onInteractionChange(false);
    };
    
    // --- ADDED: Handler for new button ---
    const handleShowSetup = () => {
        if (window.confirm("Are you sure you want to end this game and start a new one? All progress will be lost.")) {
            actions.setupNewGame(); // 1. Clears the hook state
            onShowSetupRequest();   // 2. Tells lobby to change view
        }
    };

    // --- UPDATED LOGIC FOR BUTTON STATE ---
    const isDealDisabled = useMemo(() => {
        if (isBettingLocked) return true; // Disabled if bets are locked

        const activePlayers = players.filter(p => !p.isTakingBreak && p.initialHandsCount > 0);
        if (activePlayers.length === 0) return true; // No one to deal to

        // Check if all hands have bets
        for (const player of activePlayers) {
            if (player.hands.length === 0) return true; // Hands not even created
            for (const hand of player.hands) {
                if (hand.bet <= 0) return true; // Found a hand with no bet
            }
        }
        
        return false; // All hands have bets
    }, [players, isBettingLocked]);
    // --- END UPDATED LOGIC ---

    return (
        <>
            {isReadOnly && <ActionToast messages={messages} />}
            <Celebration messages={messages} />
            <div className="blackjack-game-screen">
                <div className="player-list-container">
                    <BlackjackPlayerList players={players} gameState={gameState} />
                    <ActionLog messages={messages} />
                </div>
                <div className="main-content-container">
                    <div className="stage-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h2>{toTitleCase(gameStage)}</h2>
                        {isReadOnly && <div className="badge badge-warning" style={{ marginTop: '0.5rem' }}>SPECTATOR MODE</div>}
            
                        {!isReadOnly && <StreamControls gameState={gameState} gameType="blackjack" style={{ marginTop: '0.5rem' }} onHandedOver={actions.setupNewGame} />}
                        {!isReadOnly && canUndo && <button className="btn-sm btn-outline-secondary" style={{ marginTop: '0.5rem' }} onClick={undo}>↩ Undo</button>}
                    </div>

                    <BlackjackDealerDisplay dealerNet={dealerNet} />

                    {gameStage === 'betting' && (
                        <div style={isReadOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
                            <BlackjackGameControls
                                onStartRound={actions.startRound}
                                onShowModal={handleShowModal}
                                onShowOwings={handleShowOwings}
                                onUnlockBets={actions.unlockAllBets} 
                                isBettingLocked={isBettingLocked} 
                                isDealDisabled={isDealDisabled}
                                onShowSetup={handleShowSetup}
                            />
                        </div>
                    )}
                    
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
                                    onPlayerAction={actions.handlePlayerAction}
                                    onSetHandStatus={actions.setHandStatus}
                                    onUnlockBet={actions.unlockAllBets} 
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
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
            />

            <OwingsModal
                isOpen={showOwings}
                onClose={handleCloseOwings}
                transactions={transactions}
            />
        </>
    );
};

export default BlackjackGameScreen;