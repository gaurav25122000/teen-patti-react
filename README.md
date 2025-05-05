# Teen Patti Bets Manager (React Version)

This is a web-based application built with React and TypeScript to track bets and player balances during a game of Teen Patti. It aims to replicate the functionality of the original Python script with a graphical user interface.

## Features

*   **Player Management:** Add, remove, and view players with their current balances.
*   **Round Tracking:** Start new rounds, set boot amounts, and manage the betting process.
*   **Betting Actions:** Handle bets (chaal), folds, and shows (basic implementation).
*   **Automatic Calculations:** Tracks the pot amount and updates player balances.
*   **Turn Management:** Automatically determines the next player's turn.
*   **Persistence:** Saves the game state (players, last winner) to the browser's `localStorage` so you can resume later.
*   **Action Log:** Displays a history of actions within the current session.

## Tech Stack

*   React
*   TypeScript
*   Vite (Build tool and development server)
*   CSS (for styling)
*   `localStorage` (for saving game state)

## Getting Started

1.  **Clone the repository (if you haven't already).**
2.  **Navigate to the project directory:**
    ```bash
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173` or similar).

## License

This project uses the MIT License. See the main  file for details.
