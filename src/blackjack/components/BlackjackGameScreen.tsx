// teen-patti-react/src/blackjack/components/BlackjackGameScreen.tsx
// src/blackjack/components/BlackjackGameScreen.tsx
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

interface BlackjackGameScreenProps {
    blackjackHook: ReturnType<typeof useBlackjackGame>;
    onInteractionChange: (isOpen: boolean) => void; 
    onShowSetupRequest: () => void; // ADDED
}

const BlackjackGameScreen: React.FC<BlackjackGameScreenProps> = ({ blackjackHook, onInteractionChange, onShowSetupRequest }) => {
    const { gameState, actions } = blackjackHook;
    const { players, messages, gameStage, currentPlayerId, currentHandId, dealerNet, isBettingLocked } = gameState; // ADDED isBettingLocked

    const [modalMode, setModalMode] = useState<ModalMode>('none');
    const [showOwings, setShowOwings] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

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
                    <div className="stage-display">
                        <h2>{toTitleCase(gameStage)}</h2>
                    </div>

                    <BlackjackDealerDisplay dealerNet={dealerNet} />

                    {gameStage === 'betting' && (
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

            <OwingsModal
                isOpen={showOwings}
                onClose={handleCloseOwings}
                transactions={transactions}
            />
        </>
    );
};

export default BlackjackGameScreen;