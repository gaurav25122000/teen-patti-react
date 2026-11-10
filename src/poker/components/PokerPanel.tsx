import React, { useState } from 'react';
import type { PokerGameState, PokerPlayer } from '../types/pokerGameTypes';
import type { PlayerAction } from '../engine';
import { toTitleCase } from '../../utils/formatters';
import { pokerChips, stepDown, stepUp } from '../../utils/quickBets';
import { readAppSettings } from '../../utils/appSettings';
import ActionPanel, { type PanelButton } from '../../components/ActionPanel';

interface PokerPanelProps {
    gameState: PokerGameState;
    currentPlayer: PokerPlayer;
    timer: string | null;
    onAction: (action: PlayerAction, amount?: number) => void;
}

// The turn's panel; the parent keys it by turn and bet, so the amount and any error reset.
const PokerPanel: React.FC<PokerPanelProps> = ({ gameState, currentPlayer, timer, onAction }) => {
    const { currentBet, lastRaiseAmount, bigBlindAmount } = gameState;
    const p = currentPlayer;
    const name = toTitleCase(p.name);
    const pot = gameState.players.reduce((sum, x) => sum + x.totalPotContribution, 0);
    const canCheck = p.roundBet >= currentBet;
    const callAmount = Math.min(currentBet - p.roundBet, p.stack);
    const facingAllInCall = !canCheck && callAmount === p.stack;
    const minTotal = currentBet > 0 ? currentBet + (lastRaiseAmount || bigBlindAmount) : bigBlindAmount;
    const maxTotal = p.roundBet + p.stack;
    const canRaise = !p.canOnlyCall && p.stack > callAmount && !facingAllInCall;
    const [amount, setAmount] = useState(Math.min(minTotal, maxTotal));
    const [error, setError] = useState<string | null>(null);

    const raise = () => {
        if (currentBet > 0 && !(amount >= minTotal)) return setError(`Raise must be at least to ${minTotal}.`);
        if (currentBet === 0 && !(amount >= bigBlindAmount)) return setError(`Bet must be at least the big blind (${bigBlindAmount}).`);
        if (amount - p.roundBet > p.stack) return setError("You cannot raise more than your stack.");
        onAction(currentBet > 0 ? 'raise' : 'bet', amount);
    };
    const fold = () => {
        if (readAppSettings().confirmFold && !window.confirm(`Fold ${name}?`)) return;
        onAction('fold');
    };
    const call: PanelButton = facingAllInCall
        ? { label: `ALL-IN ₹${callAmount}`, onClick: () => onAction('call') }
        : canCheck ? { label: 'CHECK', onClick: () => onAction('check') } : { label: `CALL ₹${callAmount}`, onClick: () => onAction('call') };

    const buttons: PanelButton[] = [
        { label: 'FOLD', onClick: fold, kind: 'fold' },
        ...(canRaise ? [call] : []),
        ...(facingAllInCall ? [] : [{ label: `ALL-IN ₹${p.stack}`, onClick: () => onAction('all-in') }]),
        canRaise ? { label: `${currentBet > 0 ? 'RAISE' : 'BET'} ₹${amount}`, onClick: raise, kind: 'primary' } : { ...call, kind: 'primary' },
    ];

    return (
        <ActionPanel
            info={<><strong>{name}</strong> · {gameState.gameStage.toUpperCase()} · To call ₹{canCheck ? 0 : callAmount} · Pot ₹{pot} · Stack ₹{p.stack}{timer && <> · ⏱ {timer}</>}</>}
            stepper={canRaise ? {
                amount,
                onAmount: setAmount,
                onMinus: () => setAmount(a => stepDown(a, bigBlindAmount, minTotal)),
                onPlus: () => setAmount(a => Math.min(maxTotal, stepUp(a, bigBlindAmount, minTotal))),
                chips: pokerChips({ pot, currentBet, bigBlind: bigBlindAmount, minTotal, maxTotal }),
            } : undefined}
            error={error}
            buttons={buttons}
        />
    );
};

export default PokerPanel;
