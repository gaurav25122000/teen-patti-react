import React, { useState } from 'react';
import type { PokerGameState, PokerPlayer } from '../types/pokerGameTypes';
import type { PlayerAction } from '../engine';
import { toTitleCase, formatAmount } from '../../utils/formatters';
import { pokerChips, stepDown, stepUp } from '../../utils/quickBets';
import { readAppSettings } from '../../utils/appSettings';
import ActionPanel, { type PanelButton } from '../../components/ActionPanel';
import { useFormError } from '../../hooks/useFormError';

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
    const floor = Math.min(minTotal, maxTotal); // a short stack can only go all-in
    const [amount, setAmount] = useState(floor);
    const [error, setError] = useFormError();

    const raise = () => {
        if (amount >= maxTotal) return onAction('all-in'); // the whole stack, even short of a full raise
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
        ? { label: `ALL-IN ₹${formatAmount(callAmount)}`, onClick: () => onAction('call'), theme: 'btn-accent rainbow-outline' }
        : canCheck ? { label: 'CHECK', onClick: () => onAction('check'), theme: 'btn-primary' } : { label: `CALL ₹${formatAmount(callAmount)}`, onClick: () => onAction('call'), theme: 'btn-primary' };

    const buttons: PanelButton[] = [
        { label: 'FOLD', onClick: fold, theme: 'btn-error' },
        ...(canRaise ? [call] : []),
        ...(facingAllInCall || p.canOnlyCall ? [] : [{ label: `ALL-IN ₹${formatAmount(p.stack)}`, onClick: () => onAction('all-in'), theme: 'btn-accent rainbow-outline' }]),
        canRaise ? { label: `${currentBet > 0 ? 'RAISE' : 'BET'} ₹${formatAmount(amount)}`, onClick: raise, theme: 'btn-success', kind: 'primary' } : { ...call, kind: 'primary' },
    ];

    return (
        <ActionPanel
            info={<><strong>{name}</strong> · {gameState.gameStage.toUpperCase()} · <span className="panel-stake">To call ₹{formatAmount(canCheck ? 0 : callAmount)}</span> · Stack ₹{formatAmount(p.stack)}{timer && <> · ⏱ {timer}</>}</>}
            pot={pot}
            stepper={canRaise ? {
                amount,
                onAmount: setAmount,
                onMinus: () => setAmount(a => stepDown(a, bigBlindAmount, floor)),
                onPlus: () => setAmount(a => Math.min(maxTotal, stepUp(a, bigBlindAmount, floor))),
                chips: pokerChips({ pot, currentBet, toCall: currentBet - p.roundBet, bigBlind: bigBlindAmount, minTotal, maxTotal }),
            } : undefined}
            error={error}
            buttons={buttons}
        />
    );
};

export default PokerPanel;
