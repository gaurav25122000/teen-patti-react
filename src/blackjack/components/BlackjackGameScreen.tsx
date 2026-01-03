import React, { useState, useMemo, useEffect } from 'react'; 
import type { useBlackjackGame } from '../hooks/useBlackjackGame';
import BlackjackPlayerList from './BlackjackPlayerList';
import BlackjackPlayerHands from './BlackjackPlayerHands';
import ActionLog from '../../components/ActionLog';
import BlackjackGameControls from './BlackjackGameControls'; 
import BlackjackDealerDisplay from './BlackjackDealerDisplay'; 
import BlackjackManageModal, { type ModalMode } from './BlackjackManageModal';
import InteractionModal from '../../components/InteractionModal';
import { toTitleCase } from '../../utils/formatters';
import OwingsModal from '../../components/OwingsModal';
import { calculateOwings, type Transaction } from '../../utils/owingsLogic';
import { useBroadcast } from '../../hooks/useBroadcast';

interface BlackjackGameScreenProps {
    blackjackHook: ReturnType<typeof useBlackjackGame>;
    onInteractionChange: (isOpen: boolean) => void; 
    onShowSetupRequest: () => void; // ADDED
    isReadOnly?: boolean;
}

const BlackjackGameScreen: React.FC<BlackjackGameScreenProps> = ({ blackjackHook, onInteractionChange, onShowSetupRequest, isReadOnly = false }) => {
    const { gameState, actions } = blackjackHook;
    const { players, messages, gameStage, currentPlayerId, currentHandId, dealerNet, isBettingLocked } = gameState; // ADDED isBettingLocked

    const [modalMode, setModalMode] = useState<ModalMode>('none');
    const [showOwings, setShowOwings] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // Streaming Hook
    const { startStreaming, stopStreaming, broadcast, isStreaming, streamId, viewerCount } = useBroadcast(gameState);
    const [showStreamModal, setShowStreamModal] = useState(false);

    // Broadcast state changes
    useEffect(() => {
        if (isStreaming && !isReadOnly) {
            broadcast({ ...gameState, gameType: 'blackjack' });
        }
    }, [gameState, isStreaming, broadcast, isReadOnly]);

    const handleStartStream = () => {
        startStreaming();
        setShowStreamModal(true);
    };

    const handleStopStream = () => {
        stopStreaming();
        setShowStreamModal(false);
    };

    const copyStreamLink = () => {
        const link = `${window.location.origin}/watch/${streamId}`;
        navigator.clipboard.writeText(link);
        alert('Stream link copied to clipboard!');
    };

    const handleShowModal = (mode: ModalMode) => {
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
            <div className="game-screen">
                <div className="player-list-container">
                    <BlackjackPlayerList players={players} gameState={gameState} />
                    <ActionLog messages={messages} />
                </div>
                <div className="main-content-container">
                    <div className="stage-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h2>{toTitleCase(gameStage)}</h2>
                        {isReadOnly && <div className="badge badge-warning" style={{ marginTop: '0.5rem' }}>SPECTATOR MODE</div>}
            
                        {!isReadOnly && !isStreaming && (
                            <button 
                                className="btn-sm btn-outline-info" 
                                style={{ marginTop: '0.5rem' }} 
                                onClick={handleStartStream}
                            >
                                Start Live Stream
                            </button>
                        )}
                        
                        {!isReadOnly && isStreaming && (
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="badge badge-success">LIVE ({viewerCount})</span>
                                <button className="btn-sm btn-outline-secondary" onClick={() => setShowStreamModal(true)}>Link</button>
                                <button className="btn-sm btn-outline-danger" onClick={handleStopStream}>Stop</button>
                            </div>
                        )}
                    </div>

                    <BlackjackDealerDisplay dealerNet={dealerNet} />

                    {gameStage === 'betting' && !isReadOnly && (
                        <BlackjackGameControls
                            onStartRound={actions.startRound}
                            onShowModal={handleShowModal}
                            onShowOwings={handleShowOwings}
                            onUnlockBets={actions.unlockAllBets} 
                            isBettingLocked={isBettingLocked} 
                            isDealDisabled={isDealDisabled}
                            onShowSetup={handleShowSetup} // ADDED
                        />
                    )}
                    
                    {/* --- REMOVED "Settle Bets" button --- */}
                    {gameStage === 'dealer-turn' && (
                        <div className="game-controls-container">
                             <p style={{textAlign: 'center', fontSize: '1.2rem', color: 'var(--color-glow-yellow)'}}>
                                Settle all player hands (Win/Lose/Push/Bust/Blackjack).
                                <br />
                                The round will end automatically.
                             </p>
                        </div>
                    )}

                    <div className="blackjack-hands-area" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
                        {players.filter(p => !p.isTakingBreak).map(player => (
                            <BlackjackPlayerHands
                                key={player.id}
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

            {showStreamModal && !streamId && (
                 <InteractionModal 
                    isOpen={true} 
                    onClose={() => setShowStreamModal(false)}
                    title="Starting Stream..."
                    theme="default"
                    footerContent={null}
                >
                    <div style={{ padding: '20px', textAlign: 'center' }}>Connecting to stream server...</div>
                </InteractionModal>
            )}

            {showStreamModal && streamId && (
                 <InteractionModal 
                    isOpen={true} 
                    onClose={() => setShowStreamModal(false)}
                    title="Live Stream Started"
                    theme="success"
                    footerContent={<button className="btn-modal btn-modal-primary" onClick={() => setShowStreamModal(false)}>Close</button>}
                >
                    <div style={{ textAlign: 'center' }}>
                        <p>Share this link with friends to let them watch:</p>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <input 
                                type="text" 
                                readOnly 
                                value={`${window.location.origin}/watch/${streamId}`} 
                                style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', color: '#fff' }}
                            />
                            <button className="btn-secondary" onClick={copyStreamLink}>Copy</button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '12px' }}>
                            Keep this tab open. Stream ends if you leave.
                        </p>
                    </div>
                </InteractionModal>
            )}

            <OwingsModal
                isOpen={showOwings}
                onClose={handleCloseOwings}
                transactions={transactions}
            />
        </>
    );
};

export default BlackjackGameScreen;