import React from 'react';
import './TableView.css';

export interface Seat {
    id: number;
    name: string;
    amount: string;
    status: string;
    className: string;
    dealer?: boolean;
}

interface TableViewProps {
    seats: Seat[];
    center: React.ReactNode;
}

// Seats around an oval, first seat at the bottom, going clockwise.
const TableView: React.FC<TableViewProps> = ({ seats, center }) => (
    <div className="table-view">
        <div className="table-felt">
            <div className="table-center">{center}</div>
        </div>
        {seats.map((seat, i) => {
            const angle = Math.PI / 2 + (2 * Math.PI * i) / seats.length;
            return (
                <div
                    key={seat.id}
                    data-player-id={seat.id}
                    className={`table-seat ${seat.className}`}
                    style={{ left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 42 * Math.sin(angle)}%` }}
                >
                    <div className="seat-name">{seat.name}{seat.dealer && <span className="dealer-badge">D</span>}</div>
                    <div className="seat-amount">{seat.amount}</div>
                    {seat.status && <div className="seat-status">{seat.status}</div>}
                </div>
            );
        })}
    </div>
);

export const ViewToggle: React.FC<{ view: string; onChange: (view: string) => void }> = ({ view, onChange }) => (
    <span className="view-toggle">
        <button aria-pressed={view !== 'table'} onClick={() => onChange('list')}>List</button>
        <button aria-pressed={view === 'table'} onClick={() => onChange('table')}>Table</button>
    </span>
);

export default TableView;
