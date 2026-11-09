import React from 'react';

interface TableRulesInput {
    potLimit: string;
    maxBlindTurns: string;
    maxChaal: string;
}

interface TableRulesFieldsProps {
    value: TableRulesInput;
    onChange: (value: TableRulesInput) => void;
}

const FIELDS: { key: keyof TableRulesInput; label: string }[] = [
    { key: 'potLimit', label: 'Pot limit (₹)' },
    { key: 'maxBlindTurns', label: 'Max blind turns (1-20)' },
    { key: 'maxChaal', label: 'Max chaal (₹)' },
];

// Empty field = rule off.
const TableRulesFields: React.FC<TableRulesFieldsProps> = ({ value, onChange }) => (
    <>
        {FIELDS.map(({ key, label }) => (
            <div className="form-group" key={key}>
                <label htmlFor={`rule-${key}`}>{label}</label>
                <input id={`rule-${key}`} type="number" min="1" placeholder="Off" value={value[key]}
                    onChange={e => onChange({ ...value, [key]: e.target.value })} />
            </div>
        ))}
    </>
);

export default TableRulesFields;
