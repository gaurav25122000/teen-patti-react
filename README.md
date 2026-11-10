# Teen Patti Bets Manager - Neon Casino Edition

This is a web-based application built with React and TypeScript to manage bets, player balances, and game flow for the card game Teen Patti. It features a vibrant "Neon Casino Night" theme and a fully responsive user interface that works seamlessly on both desktop and mobile devices.

The application leverages local storage to save game state, allowing you to close the browser and resume your game later.

## ✨ Features

  * **Modern & Responsive UI:** A stylish "Neon Casino" theme that adapts to any screen size, from mobile phones to desktops.
  * **Complete Game Flow:** Handles all major game actions including blind bets, raises, seeing cards (`chaal`), folding, and showdowns.
  * **Dynamic State Management:** Automatically tracks the current player's turn, pot amount, and individual player stakes.
  * **Player & Game Management:**
      * Add or remove players on the fly (between rounds).
      * Manually set boot amounts for each round.
      * Reorder players to change the turn sequence.
      * Manually end betting and select a winner if needed.
  * **State Persistence:** Your game state (players, balances, last winner) is automatically saved to the browser's `localStorage`, so you can pick up where you left off.
  * **Action Log:** A running terminal-style log keeps a history of every action taken during the game for easy reference.
  * **Interactive Modals:** A sleek, unified modal system for all user interactions, complete with a background blur effect for focus.
  * **Undo:** The host can undo one action per tap, back to the start of the current round. A finished round can't be undone, because its winnings are already saved.
  * **Table View:** Teen Patti and Poker players can be shown around a round table instead of a list; each device remembers its choice.
  * **Win Celebrations:** Confetti and a winner banner on the host and every stream viewer.
  * **Live Stream:** Share a link or QR code. Viewers pick who they are to see their balance, their row highlighted and a "Your turn!" alert (with vibration on Android). The host can hand the game to a viewer's phone: it moves there (and is removed from the host's phone) and starts a new stream link.
  * **Install & Offline:** Installable as an app; local games work without internet once the app has loaded. Streaming and Lifetime Winnings need a connection.
  * **Notes:** Saved automatically as you type.
  * **Blackjack Insurance:** A side bet of half the hand's bet; at the dealer's turn the host says whether the dealer had blackjack, and it pays 2:1.
  * **Saved Players:** Players are saved on this device (name, phone, optional UPI ID) when a game is set up or a player is added; tap a chip on any setup screen to fill a row. Manage them from the home screen, and check everyone's lifetime winnings in one tap.
  * **Settle Up:** Final Owings has a PAY button (UPI, amount filled in) for payees with a saved UPI ID, and COPY / WHATSAPP to share the settlement with a night summary (biggest pot, most rounds won, best streak, biggest winner and loser).
  * **History:** The last 50 finished games (older ones are kept while a payment is unpaid, up to 200), with each payment's paid tick, the summary, re-sharing and SHARE IMAGE. **Player stats** (games, wins, total, best, worst, average, running total, head to head) are worked out from it.
  * **Settings per game:** a Settings sheet between rounds and a "Table settings" section at setup; saving logs what changed. Teen Patti: boot, pot limit, max blind turns, max chaal, turn timer, boot rise. Poker: blinds, blind level, ante, straddle, turn timer, rebuy limits, add-on, min/max buy-in, bomb pots. Blackjack: payout, surrender, min/max bet, insurance, hands per player, rotating banker, side bets.
  * **Poker Blind Levels:** Optional blind clock; blinds double at the first hand after each level ends, with pause and resume.
  * **Poker Tournament:** buy-in for starting chips, rebuys through the bust prompt, an add-on, places by chips at the start of the hand, payouts (defaults by entrants) and CHOP; it settles prize less money paid.
  * **Blackjack Banker and Side Bets:** a player can bank every N rounds instead of the house; Perfect Pairs and 21+3 side bets.
  * **Settle through one person:** Final Owings can route every payment through one player instead of the fewest transfers.
  * **Session length:** summaries end with the session's length and the biggest winner's rate per hour.
  * **Lifetime Winnings ranges:** All time, This month, Last 30 days, This year or a custom range.
  * **Docked action panel:** turn, stake, timer and pot, a stepper with quick chips, and large neon buttons, one colour per purpose; one ☰ TABLE sheet holds the rest. From 700 px wide, game screens use two columns with the log on the right. Sounds, haptics, keep-awake and Confirm before fold are app settings (home → Settings).
  * **Avatars:** each saved player gets a colour and an optional emoji, shown beside their name.
  * **Sync:** a group key, shared by code or QR, syncs saved players and history between phones, end-to-end encrypted.

## 🚀 Tech Stack

  * **Frontend:** React (with Hooks) & TypeScript
  * **Build Tool:** Vite
  * **Styling:** CSS with a fully custom "Neon Casino" theme (no UI libraries).
  * **State Persistence:** Browser `localStorage` API.
  * **Linting:** ESLint with TypeScript support.

## 🏁 Getting Started

Follow these steps to get the project running on your local machine.

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/your-username/teen-patti-react.git
    cd teen-patti-react
    ```

2.  **Install Dependencies**
    This project uses `npm`. Run the following command to install the required packages:

    ```bash
    npm install
    ```

3.  **Run the Development Server**
    Start the Vite development server:

    ```bash
    npm run dev
    ```

4.  **Open in Browser**
    Navigate to the local URL provided by Vite (usually `http://localhost:5173`).

5.  **Run the Tests**
    Needs Node 22.18+ (runs TypeScript tests directly):

    ```bash
    npm test
    ```

`npm run build` type-checks (`tsc -b`) before building, so type errors fail the build.

## 📡 Live Streaming (TURN)

Spectator streams use WebRTC via PeerJS. Viewers on other networks (especially mobile data) need a TURN relay; PeerJS's built-in one no longer works. Set these build-time env vars (in Netlify: Site configuration → Environment variables, then redeploy):

| Variable | Example |
| --- | --- |
| `VITE_TURN_URLS` | `turn:relay.example.com:3478,turns:relay.example.com:443?transport=tcp` |
| `VITE_TURN_USERNAME` | TURN username |
| `VITE_TURN_CREDENTIAL` | TURN password |

All three are needed together. They are embedded in the public bundle, so use credentials you can rotate. Without them, streaming falls back to STUN only and works only when both sides can connect directly.

## 🔄 Sync (server table)

Sync stores only encrypted blobs, through the `syncGet` and `syncPut` Netlify functions on the same Neon database as Lifetime Winnings. Run this once on that database; until then both functions answer 503 "Sync isn't set up on the server yet.":

```sql
CREATE TABLE IF NOT EXISTS sync_blobs (
  group_id CHAR(64) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('players','history')),
  blob TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, kind)
);
```

## 📁 Project Structure

The project is organized into a clean, component-based architecture for better maintainability.

```
src/
├── assets/         # SVG icons and other static assets
├── components/     # Reusable React components (UI)
│   ├── ActionLog.tsx
│   ├── ActionPanel.tsx     # the docked panel every game uses
│   ├── GameScreen.tsx
│   ├── GameSetup.tsx
│   ├── InteractionModal.tsx
│   ├── PlayerList.tsx
│   ├── TableSheet.tsx      # the ☰ TABLE sheet
│   └── TeenPattiPanel.tsx
├── constants/      # App-wide constants (e.g., localStorage key)
├── hooks/          # Custom hooks for business logic
│   └── useTeenPattiGame.ts
├── types/          # TypeScript type definitions
│   └── gameTypes.ts
├── utils/          # Helper functions
│   ├── formatters.ts
│   └── localStorage.ts
├── App.css         # Main stylesheet for the application
├── App.tsx         # Main application component/shell
└── main.tsx        # Entry point of the React application
```

## 🎮 How to Play

1.  **Setup:**

      * On the first launch, you'll be on the setup screen.
      * Enter each player's name, starting balance and phone; "Add seat" adds a row and ✕ removes one.
      * Click "Start Game".
      * Alternatively, click "Load Saved Game" if you have a previous session.

2.  **Starting a Round:**

      * The game will prompt you to set the **Boot Amount** for the first round.
      * If it's not the first round, the game will automatically use the previous boot amount and start the round with the player next to the last winner.
      * You can change the boot amount between rounds from ☰ TABLE → Change boot.

3.  **Player Actions:**

      * The highlighted player is the current turn.
      * **Blind players** can `PLAY` (match the current stake), `RAISE` (set a higher amount with the stepper or chips), or `SEE`.
      * **Seen players** (`CHAAL`) must bet at least double the current stake.
      * Any player can `FOLD` or request a `SHOW` (if conditions are met).

4.  **Ending a Round:**

      * A round ends when all but one player have folded, or after a `Show`.
      * The winner's balance is automatically updated with the pot amount.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.