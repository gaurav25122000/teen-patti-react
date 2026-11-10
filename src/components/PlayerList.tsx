// src/components/PlayerList.tsx

import React, { useState } from 'react';
import Avatar from './Avatar';
import { readSavedPlayers } from '../utils/savedPlayers';
import type { Player, GameState } from '../types/gameTypes';
import { toTitleCase } from '../utils/formatters';
import TableView, { ViewToggle } from './TableView';
import { useStoredState } from '../hooks/useStoredState';
import { dealerOf } from '../utils/teenPattiRules';

interface PlayerListProps {
    players: Player[];
    gameState: GameState;
    currentPlayer: Player | null;
}

const PlayerList: React.FC<PlayerListProps> = ({ players, gameState, currentPlayer }) => {
    const [saved] = useState(() => readSavedPlayers());
    // Players who left still count, so the net shows whether the table balances.
    const netBalance = players.reduce((acc, player) => acc + player.balance, 0) + (gameState.departed ?? []).reduce((acc, d) => acc + d.net, 0);
    const [view, setView] = useStoredState('seatView', 'list');
    const dealerId = dealerOf(gameState);

    const rows = players.map(p => {
        const isFolded = gameState.foldedPlayerIds.has(p.id);
        const isCurrent = gameState.roundActive && currentPlayer?.id === p.id;
        const contribution = gameState.roundContributions.get(p.id) || 0;
        let status = "Waiting";

        // MODIFIED LOGIC
        if (p.isTakingBreak) {
            status = "On Break";
        } else if (gameState.roundActive) {
            if (isFolded) {
                status = "Folded";
            } else {
                status = gameState.blindPlayerIds.has(p.id) ? "Blind" : "Seen (Chaal)";
                if (isCurrent) status += " (Current Turn)";
            }
        }

        // MODIFIED CLASSNAME
        const className = `${isFolded ? 'folded' : ''} ${isCurrent ? 'current-player' : ''} ${p.isTakingBreak ? 'on-break' : ''}`;
        return { p, contribution, status, className };
    });

    return (
        <div className="player-list">
            <h3>Players ({players.length}) <ViewToggle view={view} onChange={setView} /></h3>
            {view === 'table' ? (
                <TableView
                    seats={rows.map(({ p, status, className }) => ({ id: p.id, name: toTitleCase(p.name), phone: p.phoneNumber, amount: `₹ ${p.balance}`, status, className, dealer: p.id === dealerId }))}
                    saved={saved}
                    center={<>Pot ₹{gameState.potAmount}<br />Stake ₹{gameState.currentStake}</>}
                />
            ) : (
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Balance</th>
                        <th>Pot Contribution</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ p, contribution, status, className }) => {
                        return (
                            <tr key={p.id} className={className} data-player-id={p.id}>
                                <td data-label="ID">{p.id}</td>
                                <td data-label="Name"><Avatar name={p.name} phone={p.phoneNumber} saved={saved} /> {toTitleCase(p.name)}{p.id === dealerId && <span className="dealer-badge">D</span>}</td>
                                <td data-label="Balance">₹ {p.balance}</td>
                                <td data-label="Contribution">₹ {contribution}</td>
                                <td data-label="Status">{status}</td>
                            </tr>

                        );
                    })}
                </tbody>
                 <tfoot>
                    <tr>
                        <td colSpan={2}>Net Balance</td>
                        <td>₹ {netBalance}</td>
                        <td colSpan={2}></td>
                    </tr>
                </tfoot>
            </table>
            )}
        </div>
    );
};

export default PlayerList;