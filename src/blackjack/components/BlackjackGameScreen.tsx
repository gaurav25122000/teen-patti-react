// src/blackjack/components/BlackjackGameScreen.tsx
import React, { useState, useMemo } from 'react'; // Added useMemo
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
}

const BlackjackGameScreen: React.FC<BlackjackGameScreenProps> = ({ blackjackHook, onInteractionChange }) => {
    const { gameState, actions } = blackjackHook;
    const { players, messages, gameStage, currentPlayerId, currentHandId, dealerNet } = gameState;

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

    // --- ADDED LOGIC FOR BUTTON STATE ---
    const { buttonText, isButtonDisabled } = useMemo(() => {
        if (gameStage !== 'betting') {
            return { buttonText: 'Deal Cards', isButtonDisabled: true };
        }

        const activePlayers = players.filter(p => !p.isTakingBreak && p.initialHandsCount > 0);
        if (activePlayers.length === 0) {
            return { buttonText: 'No Active Players', isButtonDisabled: true };
        }

        const handsAreCreated = activePlayers.every(p => p.hands.length > 0);

        if (!handsAreCreated) {
            return { buttonText: 'Show Bet Slips', isButtonDisabled: false };
        }

        const allBetsPlaced = activePlayers.every(p => p.hands.every(h => h.bet > 0));
        
        return {
            buttonText: 'Deal Cards',
            isButtonDisabled: !allBetsPlaced
        };

    }, [players, gameStage]);
    // --- END ADDED LOGIC ---

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
                            buttonText={buttonText} // UPDATED
                            isButtonDisabled={isButtonDisabled} // UPDATED
                        />
                    )}
                    
                    {gameStage === 'dealer-turn' && (
                        <div className="game-controls-container">
                             <p>Settle all player hands (Win/Lose/Push) based on the dealer's hand.</p>
                            <button className="btn-success btn-action-lg" onClick={actions.endRoundAndPay}>
                                Settle Bets & End Round
                            </button>
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
                                onPlaceBet={actions.placeBet}
                                onPlayerAction={actions.handlePlayerAction}
                                onSetHandStatus={actions.setHandStatus}
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