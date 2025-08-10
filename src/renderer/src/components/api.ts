import { Chess as ChessJS, SQUARES } from "chess.js"
import Chessground from "./Chessground.svelte"
export class Api {
  cg: Chessground
  stateChangeCallback: (api: any) => void
  promotionCallback: (arg0: any) => any
  moveCallback: (m: any) => void
  gameOverCallback: (go: any) => void
  _orientation: string
  chessJS: ChessJS
  gameIsOver = false
  initialised = false

  constructor(
    cg: Chessground,
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    stateChangeCallback = (api: any) => {}, // called when the game state (not visuals) changes
    promotionCallback = async (sq: any) => "q", // called before promotion
    moveCallback = (m: any) => {}, // called after move
    gameOverCallback = (go: any) => {}, // called after game-ending move
    _orientation = "w"
  ) {
    this.cg = cg
    this.stateChangeCallback = stateChangeCallback
    this.promotionCallback = promotionCallback
    this.moveCallback = moveCallback
    this.gameOverCallback = gameOverCallback
    this._orientation = _orientation
    this.cg.set({
      fen,
      orientation: Api._colorToCgColor(_orientation),
      movable: { free: false },
      premovable: { enabled: false }
    })
    this.chessJS = new ChessJS(fen)
  }
  async init() {
    this.load(this.chessJS.fen())
    this.initialised = true
  }
  // Load FEN. Throws exception on invalid FEN.
  load(fen: string) {
    this.chessJS.load(fen)
    this._checkForGameOver()
    // I like it better when animation is always enabled
    // this.cg.set({ animation: { enabled: false } })
    const cgColor = Api._colorToCgColor(this.chessJS.turn())
    this.cg.set({
      fen: fen,
      turnColor: cgColor,
      check: this.chessJS.inCheck(),
      lastMove: undefined,
      selected: undefined,
      movable: {
        free: false,
        color: cgColor,
        dests: this.possibleMovesDests(),
        events: {
          after: (orig: any, dest: any) => {
            this._chessgroundMoveCallback(orig, dest)
          }
        }
      }
    })
    // this.cg.set({ animation: { enabled: true } })
    this.stateChangeCallback(this)
  }
  /*
   * Making a move
   */
  // called after a move is played on Chessground
  async _chessgroundMoveCallback(orig: string, dest: string) {
    if (orig === "a0" || dest === "a0") {
      // the Chessground square type (Key) includes a0
      throw Error("invalid square")
    }
    let cjsMove: any
    if (this._moveIsPromotion(orig, dest)) {
      const promotion = await this.promotionCallback(dest)
      cjsMove = this.chessJS.move({ from: orig, to: dest, promotion })
    } else {
      cjsMove = this.chessJS.move({ from: orig, to: dest })
    }
    const move = Api._cjsMoveToMove(cjsMove)
    this._postMoveAdmin(move)
  }
  _moveIsPromotion(orig: any, dest: string) {
    return this.chessJS.get(orig).type === "p" && (dest.charAt(1) == "1" || dest.charAt(1) == "8")
  }
  // Make a move programmatically
  // argument is either a short algebraic notation (SAN) string
  // or an object with from/to/promotion (see chess.js move())
  move(moveSanOrObj: { from: any; to: any; promotion: any }) {
    if (!this.initialised) throw new Error("Called move before initialisation finished.")
    if (this.gameIsOver) throw new Error("Invalid move: Game is over.")
    const cjsMove = this.chessJS.move(moveSanOrObj) // throws on illegal move
    const move = Api._cjsMoveToMove(cjsMove)
    this.cg.move(move.from, move.to)
    this.cg.set({ turnColor: Api._colorToCgColor(this.chessJS.turn()) })
    this._postMoveAdmin(move)
  }
  // Make a move programmatically from long algebraic notation (LAN) string,
  // as returned by UCI engines.
  moveLan(moveLan: string) {
    const from = moveLan.slice(0, 2)
    const to = moveLan.slice(2, 4)
    const promotion = moveLan.charAt(4) || undefined
    this.move({ from, to, promotion })
  }
  // Called after a move (chess.js or chessground) to:
  // - update chess-logic details Chessground doesn't handle
  // - dispatch events
  // - play engine move
  _postMoveAdmin(move: { flags: string | string[]; check: any }) {
    // reload FEN after en-passant or promotion. TODO make promotion smoother
    if (move.flags.includes("e") || move.flags.includes("p")) {
      this.cg.set({ fen: this.chessJS.fen() })
    }
    // highlight king if in check
    if (move.check) {
      this.cg.set({ check: true })
    }
    // dispatch move event
    this.moveCallback(move)
    // dispatch gameOver event if applicable
    this._checkForGameOver()
    // set legal moves
    this._updateChessgroundWithPossibleMoves()
    // update state props
    this.stateChangeCallback(this)
  }
  _updateChessgroundWithPossibleMoves() {
    const cgColor = Api._colorToCgColor(this.chessJS.turn())
    this.cg.set({
      turnColor: cgColor,
      movable: {
        color: cgColor,
        dests: this.possibleMovesDests()
      }
    })
  }
  _checkForGameOver() {
    if (this.chessJS.isCheckmate()) {
      const result = this.chessJS.turn() == "w" ? 0 : 1
      this.gameOverCallback({ reason: "checkmate", result })
      this.gameIsOver = true
    } else if (this.chessJS.isStalemate()) {
      this.gameOverCallback({ reason: "stalemate", result: 0.5 })
      this.gameIsOver = true
    } else if (this.chessJS.isInsufficientMaterial()) {
      this.gameOverCallback({ reason: "insufficient material", result: 0.5 })
      this.gameIsOver = true
    } else if (this.chessJS.isThreefoldRepetition()) {
      this.gameOverCallback({ reason: "repetition", result: 0.5 })
      this.gameIsOver = true
    } else if (this.chessJS.isDraw()) {
      // use isDraw until chess.js exposes isFiftyMoveDraw()
      this.gameOverCallback({ reason: "fifty-move rule", result: 0.5 })
      this.gameIsOver = true
    } else {
      this.gameIsOver = false
    }
  }
  /*
   *
   */
  // Find all legal moves in chessground "dests" format
  possibleMovesDests() {
    const dests = new Map()
    if (!this.gameIsOver) {
      SQUARES.forEach((s) => {
        const ms = this.chessJS.moves({ square: s, verbose: true })
        if (ms.length)
          dests.set(
            s,
            ms.map((m: { to: any }) => m.to)
          )
      })
    }
    return dests
  }
  // Reset board to the starting position
  reset() {
    this.load("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
  }
  // Undo last move
  undo() {
    const cjsMove = this.chessJS.undo()
    const move = cjsMove ? Api._cjsMoveToMove(cjsMove) : null
    const turnColor = Api._colorToCgColor(this.chessJS.turn())
    this.cg.set({
      fen: this.chessJS.fen(),
      check: this.chessJS.inCheck() ? turnColor : undefined,
      turnColor: turnColor,
      lastMove: undefined
    })
    this.gameIsOver = false
    this._updateChessgroundWithPossibleMoves()
    this.stateChangeCallback(this)
    return move
  }
  // Board orientation
  toggleOrientation() {
    this._orientation = this._orientation === "w" ? "b" : "w"
    this.cg.set({
      orientation: Api._colorToCgColor(this._orientation)
    })
    this.stateChangeCallback(this)
  }
  orientation() {
    return this._orientation
  }
  // Check if game is over (checkmate, stalemate, repetition, insufficient material, fifty-move rule)
  isGameOver() {
    return this.gameIsOver
  }
  /*
   * Methods passed through to chess.js
   */
  fen() {
    return this.chessJS.fen()
  }
  turn() {
    return this.chessJS.turn()
  }
  moveNumber() {
    return this.chessJS.moveNumber()
  }
  inCheck() {
    return this.chessJS.inCheck()
  }
  history({ verbose = false } = {}) {
    if (verbose) {
      return this.chessJS.history({ verbose }).map(Api._cjsMoveToMove)
    } else {
      return this.chessJS.history({ verbose })
    }
  }
  board() {
    return this.chessJS.board()
  }
  // Convert between chess.js color (w/b) and chessground color (white/black).
  // Chess.js color is always used internally.
  static _colorToCgColor(chessjsColor: string) {
    return chessjsColor === "w" ? "white" : "black"
  }
  static _cgColorToColor(chessgroundColor: string) {
    return chessgroundColor === "white" ? "w" : "b"
  }
  // Convert chess.js move (CjsMove) to svelte-chess Move.
  // Only difference is check:boolean and checkmate:boolean in the latter.
  static _cjsMoveToMove(cjsMove: { san: string | any[] }) {
    const lastSanChar = cjsMove.san.slice(-1)
    const checkmate = lastSanChar === "#"
    const check = lastSanChar === "+" || checkmate
    return { ...cjsMove, check, checkmate }
  }
}
