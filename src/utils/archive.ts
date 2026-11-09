import { archiveGame, historyShareText } from './history';
import { readSavedPlayers } from './savedPlayers';
import { showToast } from './toast';

// Archives a game being replaced or ended; when History can't be written, offers the settlement to copy.
export const archiveOrWarn = (...args: Parameters<typeof archiveGame>) => {
    const failed = archiveGame(...args);
    if (failed) showToast({ text: failed.message, copyText: historyShareText(failed.entry, readSavedPlayers()) });
};
