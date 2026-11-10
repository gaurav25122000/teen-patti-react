import React, { useState } from 'react';
import type { GameState, Player } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';
import { blindTurnsRefusal, potLimitReached } from '../utils/teenPattiRules';
import { stepDown, stepUp, teenPattiChips, teenPattiMinBet } from '../utils/quickBets';
import { readAppSettings } from '../utils/appSettings';
import ActionPanel, { type PanelButton } from './ActionPanel';

interface TeenPattiPanelProps {
    gameState: GameState;
    currentPlayer: Player;
    showDisabled: boolean;
    timer: string | null;
    actions: {
        playBlind: (isRaise: boolean, amount: number) => string | null; // table-rule refusal
        seeCards: () => void;
        betChaal: (amount: number) => string | null;
        fold: () => void;
        onShowClick: () => void;
        onEndBettingClick: () => void;
    };
}

// The turn's panel; the parent keys it by turn, so the amount and any error reset each turn.
const TeenPattiPanel: React.FC<TeenPattiPanelProps> = ({ gameState, currentPlayer, showDisabled, timer, actions }) => {
    const { currentStake, blindPlayerIds, potAmount } = gameState;
    const blind = blindPlayerIds.has(currentPlayer.id);
    const minBet = teenPattiMinBet(currentStake, blind);
    const [amount, setAmount] = useState(minBet);
    const [error, setError] = useState<string | null>(null);
    const name = toTitleCase(currentPlayer.name);
    const limitReached = potLimitReached(gameState);
    const mustSee = blind ? blindTurnsRefusal(gameState, name, gameState.blindTurns?.[currentPlayer.id] ?? 0) : null;

    const bet = () => {
        if (!(amount >= minBet)) return setError(`Bet must be at least ₹ ${minBet}.`);
        setError(blind ? actions.playBlind(amount > currentStake, amount) : actions.betChaal(amount));
    };
    const fold = () => {
        if (readAppSettings().confirmFold && !window.confirm(`Fold ${name}?`)) return;
        actions.fold();
    };

    const buttons: PanelButton[] = limitReached
        ? [{ label: 'PICK WINNER', onClick: actions.onEndBettingClick, theme: 'btn-secondary', kind: 'primary' }]
        : [
            { label: 'FOLD', onClick: fold, theme: 'btn-error', kind: 'fold' },
            ...(blind ? [{ label: 'SEE', onClick: actions.seeCards, theme: 'btn-orange' }] : []),
            ...(mustSee ? [] : [{ label: `SHOW ₹${minBet}`, onClick: actions.onShowClick, theme: 'btn-pink', disabled: showDisabled }]),
            { label: 'END BETTING', onClick: actions.onEndBettingClick, theme: 'btn-secondary' },
            { label: blind ? (amount > currentStake ? `RAISE ₹${amount}` : `PLAY ₹${amount}`) : `CHAAL ₹${amount}`, onClick: bet, theme: 'btn-success', kind: 'primary', disabled: !!mustSee },
        ];

    return (
        <ActionPanel
            info={<><strong>{name}</strong> · {blind ? 'BLIND' : 'SEEN'} · <span className="panel-stake">Stake ₹{minBet}</span>{timer && <> · ⏱ {timer}</>}</>}
            pot={potAmount}
            stepper={limitReached || mustSee ? undefined : {
                amount,
                onAmount: setAmount,
                onMinus: () => setAmount(a => stepDown(a, minBet, minBet)),
                onPlus: () => setAmount(a => stepUp(a, minBet, minBet)),
                chips: teenPattiChips(minBet),
            }}
            error={limitReached ? 'POT LIMIT REACHED' : mustSee ? `MUST SEE · ${mustSee}` : error}
            buttons={buttons}
        />
    );
};

export default TeenPattiPanel;
