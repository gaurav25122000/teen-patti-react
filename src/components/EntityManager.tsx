// src/components/EntityManager.tsx
import React, { useState } from 'react';
import type { Player, Entity } from '../types/gameTypes';
import InteractionModal from './InteractionModal';

interface EntityManagerProps {
    isOpen: boolean;
    onClose: () => void;
    players: Player[];
    entities: Entity[];
    onUpdateEntities: (entities: Entity[]) => void;
    onUpdatePlayers: (players: Player[]) => void;
}

const EntityManager: React.FC<EntityManagerProps> = ({ isOpen, onClose, players, entities, onUpdateEntities, onUpdatePlayers }) => {
    const [newEntityName, setNewEntityName] = useState('');

    const handleCreateEntity = () => {
        if (newEntityName.trim() === '') return;
        const newEntity: Entity = {
            id: Date.now(),
            name: newEntityName.trim(),
        };
        onUpdateEntities([...entities, newEntity]);
        setNewEntityName('');
    };

    const handleDeleteEntity = (entityId: number) => {
        onUpdateEntities(entities.filter(e => e.id !== entityId));
        onUpdatePlayers(players.map(p => p.entityId === entityId ? { ...p, entityId: undefined } : p));
    };

    const handleAddPlayerToEntity = (playerId: number, entityId: number | null) => {
        onUpdatePlayers(players.map(p => p.id === playerId ? { ...p, entityId: entityId ?? undefined } : p));
    };

    return (
        <InteractionModal
            isOpen={isOpen}
            onClose={onClose}
            title="Manage Entities"
            theme="default"
        >
            <div className="entity-manager">
                <div className="form-group">
                    <label>Create New Entity</label>
                    <input
                        type="text"
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        placeholder="Entity Name"
                    />
                    <button onClick={handleCreateEntity}>Create</button>
                </div>
                <hr />
                <h3>Existing Entities</h3>
                {entities.map(entity => (
                    <div key={entity.id} className="entity-item">
                        <h4>{entity.name} <button onClick={() => handleDeleteEntity(entity.id)}>Delete</button></h4>
                        <ul>
                            {players.filter(p => p.entityId === entity.id).map(p => (
                                <li key={p.id}>{p.name} <button onClick={() => handleAddPlayerToEntity(p.id, null)}>Remove</button></li>
                            ))}
                        </ul>
                        <div className="form-group">
                            <label>Add Player</label>
                            <select onChange={(e) => handleAddPlayerToEntity(Number(e.target.value), entity.id)}>
                                <option value="">Select Player</option>
                                {players.filter(p => !p.entityId).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        </InteractionModal>
    );
};

export default EntityManager;
