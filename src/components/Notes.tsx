// src/components/Notes.tsx
import React, { useState, useEffect } from 'react';
import './Notes.css';

interface NotesProps {
    roundActive: boolean;
}

const Notes: React.FC<NotesProps> = ({ roundActive }) => {
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const savedNotes = localStorage.getItem('poker-notes');
        if (savedNotes) {
            setNotes(savedNotes);
        }
    }, [roundActive]);

    const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNotes(event.target.value);
    };

    const handleSaveNotes = () => {
        localStorage.setItem('poker-notes', notes);
    };

    return (
        <div className="notes-container">
            <h3>Notes</h3>
            <textarea
                value={notes}
                onChange={handleNotesChange}
                placeholder="Take notes..."
            />
            <button className="btn btn-primary" onClick={handleSaveNotes}>Save Notes</button>
        </div>
    );
};

export default Notes;