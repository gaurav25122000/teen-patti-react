import React, { useState } from 'react';
import { whatsappLink } from '../utils/settlement';

// COPY and WHATSAPP for a settlement's share text.
const ShareButtons: React.FC<{ text: string }> = ({ text }) => {
    const [note, setNote] = useState<string | null>(null);

    const copy = () => {
        Promise.resolve()
            .then(() => navigator.clipboard.writeText(text))
            .then(() => setNote('Settlement copied'), () => setNote("Couldn't copy."));
    };

    const openWhatsapp = () => {
        const tab = window.open(whatsappLink(text), '_blank');
        if (tab) tab.opener = null;
        else setNote("Couldn't open WhatsApp. Use Copy instead.");
    };

    return (
        <div className="share-actions">
            <button className="btn btn-primary" onClick={copy}>COPY</button>
            <button className="btn btn-success" onClick={openWhatsapp}>WHATSAPP</button>
            {note && <p className="share-note">{note}</p>}
        </div>
    );
};

export default ShareButtons;
