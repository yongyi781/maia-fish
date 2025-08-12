# maia-fish

A chess GUI for comparing Stockfish and Maia analysis.

This application allows you to analyze chess positions and games simultaneously with:

- A chess engine such as [**Stockfish**](https://stockfishchess.org/).
- [**Maia 2**](https://maiachess.com/): A neural network trained to emulate human play at different skill levels.

## Screenshot

<img width="1010" height="893" alt="image" src="https://github.com/user-attachments/assets/a7993cfb-9064-49f0-a15e-d5f2a7498902" />

## Features

- **Side-by-side analysis**: See the top moves and evaluations from both Stockfish and Maia for any given position.
- **PGN support**: Load your own games in PGN format to analyze them.
- **Interactive board**: Play through moves and see the engines' analysis update in real-time.
- **Configurable engine settings**: Adjust the depth and other parameters for Stockfish.
- **Tricky positions**: With the help of Maia's weights, see at a glance which positions are dangerous for humans.
- **Brilliant moves**: Using Maia's weights, we can detect brilliant moves more reliably than simply detecting sacrifices.

## Todo

- Decide what to do about human evaluation when MultiPV is less than max
- Fix: Canceling in promotion dialog
- Fix: implement draw by threefold repetition and 50-move rule
- Fix: auto-analysis doesn't turn off when ending at checkmate
- Add options for other maia skill levels, maybe (if there is demand)

## Usage

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Run the application in development mode**:
    ```bash
    npm run dev
    ```
3.  **Build the application for production**:

    ```bash
    # For Windows
    npm run build:win

    # For macOS
    npm run build:mac

    # For Linux
    npm run build:linux
    ```
