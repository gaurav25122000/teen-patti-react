// src/poker/components/PokerPlayerList.tsx
import React, { useState } from 'react';
import Avatar from '../../components/Avatar';
import { readSavedPlayers } from '../../utils/savedPlayers';
import type { PokerPlayer, PokerGameState } from '../types/pokerGameTypes';
import { toTitleCase, formatAmount } from '../../utils/formatters';
import TableView, { ViewToggle } from '../../components/TableView';
import { useStoredState } from '../../hooks/useStoredState';

interface PokerPlayerListProps {
    players: PokerPlayer[];
    gameState: PokerGameState;
}

const PokerPlayerList: React.FC<PokerPlayerListProps> = ({ players, gameState }) => {
    const [saved] = useState(() => readSavedPlayers());
    const { dealerButtonIndex, smallBlindIndex, bigBlindIndex, activePlayerIndex, gameStage } = gameState;
    const [view, setView] = useStoredState('seatView', 'list');

    const rows = players.map((p, index) => {
        const isDealer = index === dealerButtonIndex && gameStage !== 'pre-deal';
        const isSB = index === smallBlindIndex && gameStage !== 'pre-deal';
        const isBB = index === bigBlindIndex && gameStage !== 'pre-deal';
        const isCurrent = index === activePlayerIndex && gameStage !== 'pre-deal';

        let status = '';
        if (p.isTakingBreak) {
            status = ' (On Break)';
        } else if (gameStage !== 'pre-deal') {
            if (isDealer) status += ' (D)';
            if (isSB) status += ' (SB)';
            if (isBB) status += ' (BB)';
            if (!p.inHand) status = 'Folded';
            if (p.isAllIn) status = 'All-In';
        }
        const className = !p.inHand && gameStage !== 'pre-deal' ? 'folded' : (isCurrent ? 'current-player' : (p.isTakingBreak ? 'on-break' : ''));
        return { p, status, className };
    });
    const totalPot = players.reduce((sum, p) => sum + p.totalPotContribution, 0);
    const some = (amount: number) => (amount >= 0.005 ? `₹ ${formatAmount(amount)}` : ''); // BET and POT only when there is one
    const inHand = players.some(p => p.roundBet >= 0.005 || p.totalPotContribution >= 0.005); // no column of ₹0s between hands

    return (
        <div className="player-list">
            <h3>Players ({players.length}) <ViewToggle view={view} onChange={setView} /></h3>
            {view === 'table' ? (
                <TableView
                    seats={rows.map(({ p, status, className }) => ({ id: p.id, name: toTitleCase(p.name), phone: p.phoneNumber, amount: `₹ ${formatAmount(p.stack)}`, status: [status.trim(), p.roundBet > 0 ? `Bet ₹${formatAmount(p.roundBet)}` : ''].filter(Boolean).join(' · '), className }))}
                    saved={saved}
                    center={<>{toTitleCase(gameStage)}<br />Pot ₹{formatAmount(totalPot)}</>}
                />
            ) : (
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Stack / Buy-In</th>
                        {inHand && <th>Round Bet</th>}
                        {inHand && <th>Pot Contri</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ p, status, className }) => {
                        return (
                            <tr key={p.id} className={className} data-player-id={p.id}>
                                <td data-label="Name">
                                    <Avatar name={p.name} phone={p.phoneNumber} saved={saved} /> {toTitleCase(p.name)} {status}
                                    {p.winningStreak > 0 && <span style={{ marginLeft: '8px' }} title="Winning Streak">🔥 {p.winningStreak}</span>}
                                </td>
                                <td data-label="Stack / Buy-In">₹ {formatAmount(p.stack)} / ₹ {formatAmount(p.totalBuyIn)}</td>
                                {inHand && <td data-label="Round Bet">{some(p.roundBet)}</td>}
                                {inHand && <td data-label="Pot Contribution">{some(p.totalPotContribution)}</td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            )}
        </div>
    );
};

export default PokerPlayerList;