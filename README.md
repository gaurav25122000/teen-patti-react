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

## 📁 Project Structure

The project is organized into a clean, component-based architecture for better maintainability.

```
src/
├── assets/         # SVG icons and other static assets
├── components/     # Reusable React components (UI)
│   ├── ActionLog.tsx
│   ├── GameControls.tsx
│   ├── GameScreen.tsx
│   ├── GameSetup.tsx
│   ├── InteractionModal.tsx
│   ├── PlayerList.tsx
│   └── RoundControls.tsx
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
      * Enter the number of players and their names/starting balances.
      * Click "Start Game".
      * Alternatively, click "Load Saved Game" if you have a previous session.

2.  **Starting a Round:**

      * The game will prompt you to set the **Boot Amount** for the first round.
      * If it's not the first round, the game will automatically use the previous boot amount and start the round with the player next to the last winner.
      * You can change the boot amount at any time between rounds using the "Change Boot" button.

3.  **Player Actions:**

      * The highlighted player is the current turn.
      * **Blind players** can `Play Blind` (match the current stake), `Raise Blind`, or `See Cards`.
      * **Seen players** (`Chaal`) must bet at least double the current stake.
      * Any player can `Fold` or request a `Show` (if conditions are met).

4.  **Ending a Round:**

      * A round ends when all but one player have folded, or after a `Show`.
      * The winner's balance is automatically updated with the pot amount.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.