// src/poker/components/PokerPlayerList.tsx
import React from 'react';
import type { PokerPlayer, PokerGameState } from '../types/pokerGameTypes';
import { toTitleCase } from '../../utils/formatters';

interface PokerPlayerListProps {
    players: PokerPlayer[];
    gameState: PokerGameState;
}

const PokerPlayerList: React.FC<PokerPlayerListProps> = ({ players, gameState }) => {
    const { dealerButtonIndex, smallBlindIndex, bigBlindIndex, activePlayerIndex, gameStage } = gameState;

    return (
        <div className="player-list">
            <h3>Players ({players.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Stack / Buy-In</th>
                        <th>Round Bet</th>
                        <th>Pot Contri</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((p, index) => {
                        const isDealer = index === dealerButtonIndex && gameStage !== 'pre-deal';
                        const isSB = index === smallBlindIndex && gameStage !== 'pre-deal';
                        const isBB = index === bigBlindIndex && gameStage !== 'pre-deal';
                        const isCurrent = index === activePlayerIndex && gameStage !== 'pre-deal';

                        let status = '';
                        if (isDealer) status += ' (D)';
                        if (isSB) status += ' (SB)';
                        if (isBB) status += ' (BB)';
                        if (!p.inHand && gameStage !== 'pre-deal') status = 'Folded';
                        if (p.isAllIn) status = 'All-In';


                        return (
                            <tr key={p.id} className={!p.inHand && gameStage !== 'pre-deal' ? 'folded' : (isCurrent ? 'current-player' : '')}>
                                <td data-label="Name">{toTitleCase(p.name)} {status}</td>
                                <td data-label="Stack / Buy-In">₹ {p.stack} / ₹ {p.totalBuyIn}</td>
                                <td data-label="Round Bet">₹ {p.roundBet}</td>
                                <td data-label="Pot Contribution">₹ {p.totalPotContribution}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default PokerPlayerList;