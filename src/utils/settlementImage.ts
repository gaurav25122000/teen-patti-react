// SHARE IMAGE: the settlement as a PNG card, shared as a file where the browser can, else downloaded.

// The card's lines: title, game and date, then the share text below its own heading.
export const cardLines = (shareText: string, subtitle: string) => ['Bets Manager', subtitle, '', ...shareText.split('\n').slice(1)];

const WIDTH = 1080;
const PAD = 64;
const LINE = 52;

// Wraps each line to the card width; returns the canvas's PNG.
const drawCard = (lines: string[]): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontFor = (i: number) => (i === 0 ? 'bold 56px sans-serif' : i === 1 ? '36px sans-serif' : '34px sans-serif');
    const rows: { text: string; font: string; i: number }[] = [];
    lines.forEach((line, i) => {
        ctx.font = fontFor(i);
        let row = '';
        for (const word of line.split(' ')) {
            const next = row ? `${row} ${word}` : word;
            if (row && ctx.measureText(next).width > WIDTH - 2 * PAD) {
                rows.push({ text: row, font: fontFor(i), i });
                row = word;
            } else row = next;
        }
        rows.push({ text: row, font: fontFor(i), i });
    });
    canvas.width = WIDTH;
    canvas.height = 2 * PAD + rows.length * LINE + LINE;
    ctx.fillStyle = '#10121a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    rows.forEach((r, n) => {
        ctx.font = r.font;
        ctx.fillStyle = r.i === 0 ? '#00C6FF' : r.i === 1 ? '#b0b0b0' : '#ffffff';
        ctx.fillText(r.text, PAD, PAD + LINE + n * LINE);
    });
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
};

// Resolves false when nothing could be shared or saved; a cancelled share sheet counts as done.
export const shareCard = async (lines: string[]): Promise<boolean> => {
    try {
        const file = new File([await drawCard(lines)], 'settlement.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] }).catch(err => { if (err?.name !== 'AbortError') throw err; });
            return true;
        }
        const url = URL.createObjectURL(file);
        const a = Object.assign(document.createElement('a'), { href: url, download: 'settlement.png' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    } catch (err) {
        console.error('Could not share the settlement image:', err);
        return false;
    }
};
