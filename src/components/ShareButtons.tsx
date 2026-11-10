import React, { useState } from 'react';
import { whatsappLink } from '../utils/settlement';
import { cardLines, shareCard } from '../utils/settlementImage';
import { cue } from '../utils/feedback';

// COPY, WHATSAPP and SHARE IMAGE for a settlement's share text; subtitle is the card's game and date.
const ShareButtons: React.FC<{ text: string; subtitle: string }> = ({ text, subtitle }) => {
    const [note, setNote] = useState<string | null>(null);

    const copy = () => {
        Promise.resolve()
            .then(() => navigator.clipboard.writeText(text))
            .then(() => { setNote('Settlement copied'); cue('share'); }, () => setNote("Couldn't copy."));
    };

    const openWhatsapp = () => {
        const tab = window.open(whatsappLink(text), '_blank');
        if (tab) {
            tab.opener = null;
            cue('share');
        } else setNote("Couldn't open WhatsApp. Use Copy instead.");
    };

    return (
        <div className="share-actions">
            <button className="btn btn-primary" onClick={copy}>COPY</button>
            <button className="btn btn-success" onClick={openWhatsapp}>WHATSAPP</button>
            <button className="btn btn-secondary" onClick={() => shareCard(cardLines(text, subtitle)).then(result => {
                if (result === 'shared') cue('share');
                if (result === 'failed') setNote("Couldn't share the image.");
            })}>SHARE IMAGE</button>
            {note && <p className="share-note">{note}</p>}
        </div>
    );
};

export default ShareButtons;
