import { Chess, Move, NormalMove, parseUci, Role, squareRank } from "chessops"
import { Score } from "./types"
import { parseFen } from "chessops/fen"
import { makeSanAndPlay } from "chessops/san"
import { rawEval } from "./game.svelte"
import { castlingSide } from "chessops/chess"

export function delay(delayInms: number) {
  return new Promise((resolve) => setTimeout(resolve, delayInms))
}

/** Inclusive */
export function randInt(low: number, high: number) {
  return low + Math.floor((high - low + 1) * Math.random())
}

export function randomChoice<T>(arr: T[]) {
  return arr[randInt(0, arr.length - 1)]
}

/** Normalizes a move: e.g. castling is e1g1 instead of e1h1. */
function normalizeMove(pos: Chess, move: NormalMove) {
  const side = castlingSide(pos, move)
  if (!side) return move
  const delta = side === "a" ? -2 : 2
  return {
    from: move.from,
    to: move.from + delta,
    promotion: move.promotion
  }
}

/** Returns all legal moves from a position. */
export function allLegalMoves(pos: Chess): Move[] {
  const promotionRoles: Role[] = ["queen", "knight", "rook", "bishop"]
  let res: Move[] = []
  for (const [from, dests] of pos.allDests()) {
    const promotions: Array<Role | undefined> =
      squareRank(from) === (pos.turn === "white" ? 6 : 1) && pos.board.pawn.has(from) ? promotionRoles : [undefined]
    for (const to of dests) {
      for (const promotion of promotions) {
        res.push(normalizeMove(pos, { from, to, promotion }))
      }
    }
  }
  return res
}

export interface UciInfo {
  depth?: number
  seldepth?: number
  multipv?: number
  score?: Score
  nodes?: number
  nps?: number
  hashfull?: number
  tbhits?: number
  time?: number // milliseconds
  pv?: string[] // principal variation moves
  [key: string]: any // for any other fields
}

/** Parse a single UCI "info" line into a UciInfo object.  */
export function parseUciInfo(line: string): UciInfo {
  const tokens = line.trim().split(/\s+/)
  if (tokens.shift() !== "info") {
    throw new Error("Not a UCI info line")
  }

  const info: UciInfo = {}
  let i = 0
  while (i < tokens.length) {
    const key = tokens[i++]

    switch (key) {
      case "depth":
        info.depth = parseInt(tokens[i++], 10)
        break
      case "seldepth":
        info.seldepth = parseInt(tokens[i++], 10)
        break
      case "multipv":
        info.multipv = parseInt(tokens[i++], 10)
        break
      case "score":
        {
          const kind = tokens[i++]
          const val = parseInt(tokens[i++], 10)
          if (kind === "cp" || kind === "mate") {
            info.score = { type: kind, value: val }
          } else {
            throw new Error(`Unknown score kind: ${kind}`)
          }
          // optional bound flag
          if (tokens[i] === "lowerbound" || tokens[i] === "upperbound") {
            info.score.bound = tokens[i] === "lowerbound" ? "lower" : "upper"
            i++
          }
        }
        break
      case "nodes":
        info.nodes = parseInt(tokens[i++], 10)
        break
      case "nps":
        info.nps = parseInt(tokens[i++], 10)
        break
      case "hashfull":
        info.hashfull = parseInt(tokens[i++], 10)
        break
      case "tbhits":
        info.tbhits = parseInt(tokens[i++], 10)
        break
      case "time":
        info.time = parseInt(tokens[i++], 10)
        break
      case "pv":
        // everything after "pv" are the moves
        info.pv = tokens.slice(i)
        i = tokens.length
        break
      default:
        // unknown key: read next token as its value
        info[key] = tokens[i++]
        break
    }
  }

  return info
}

/** Convenience method to get a chessops Chess object from a FEN string. */
export function chessFromFen(fen: string) {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

/** Formats a score. */
export function formatScore(side: "w" | "b", score: Score) {
  if (!score) return ""
  if (!isFinite(score.value)) return ""
  switch (score.type) {
    case "cp": {
      const value = side === "b" ? -score.value / 100 : score.value / 100
      return value === 0 ? "0.00" : value < 0 ? value.toFixed(2) : `+${value.toFixed(2)}`
    }
    case "mate": {
      const value = side === "b" ? -score.value : score.value
      return value < 0 ? `-#${-value}` : value > 0 ? `#${value}` : ""
    }
  }
}

/** Converts a UCI principal variation to SAN. */
export function pvUciToSan(chess: Chess, pv: string[]) {
  const pos = chess.clone()
  let res: string[] = []
  for (let uci of pv) {
    const move = parseUci(uci)
    if (!pos.isLegal(move)) return []
    res.push(makeSanAndPlay(pos, move))
  }
  return res
}

/** Converts a centipawn score to a win probability. */
export function cpToWinProb(cp: number) {
  return 1 / (1 + 10 ** (-cp / 400))
}

export const moveQualityColors = {
  best: {
    color: "hsl(190 65% 65% / 0.9)",
    threshold: 0
  },
  good: {
    color: "hsl(120 50% 60% / 0.8)",
    threshold: 0.05
  },
  inaccuracy: {
    color: "hsl(60 50% 60% / 0.8)",
    threshold: 0.1
  },
  mistake: {
    color: "hsl(30 50% 60% / 0.8)",
    threshold: 0.2
  },
  blunder: {
    color: "hsl(0 50% 60% / 0.8)",
    threshold: 1
  },
  unknown: {
    color: "hsl(100 50% 30% / 0.8)",
    threshold: 9001
  }
}

/** Determines the classification of a move (best, good, inaccuracy, mistake, blunder). */
export function classifyMove(score: Score, best: Score) {
  if (best.type === "mate" && score.type === "mate" && Math.sign(score.value) === Math.sign(best.value)) {
    return score.value === best.value ? "best" : "good"
  }
  if (best.type !== "mate" && score.type === "mate") {
    return "blunder"
  }
  const loss = cpToWinProb(rawEval(best)) - cpToWinProb(rawEval(score))
  for (const [k, v] of Object.entries(moveQualityColors)) {
    if (loss <= v.threshold) {
      return k
    }
  }
}

/** Returns the color of a move based on its classification. */
export function moveQualityColor(score: Score, best: Score) {
  const c = classifyMove(score, best)
  return opaquifyHSL(moveQualityColors[c].color)
}

/** Opaquifies a hsla color, removing the alpha. */
export function opaquifyHSL(color: string) {
  const arr = color.split(/[()\s]/)
  return `hsl(${arr[1]} ${arr[2]} ${arr[3]})`
}

/** Returns a random element from an array, weighted by its weight. */
export function randomWeightedChoice<T>(arr: [T, number][]) {
  let totalWeight = 0
  for (const o of arr) {
    totalWeight += o[1]
  }
  if (totalWeight <= 0) {
    return undefined
  }

  const t = totalWeight * Math.random()
  let total = 0
  for (const o of arr) {
    // The order doesn't matter at all when you think about it. No need to sort.
    total += o[1]
    if (total > t) {
      return o[0]
    }
  }
}
