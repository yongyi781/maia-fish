import { Chess, NormalMove, parseUci, Role, squareRank } from "chessops"
import { castlingSide } from "chessops/chess"
import { parseFen } from "chessops/fen"
import { makeSanAndPlay } from "chessops/san"
import { humanProbability, NodeData, rawEval } from "./game.svelte"
import { Score } from "./types"

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
export function normalizeMove(pos: Chess, move: NormalMove | undefined) {
  if (!move || !move["from"]) return move
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
export function allLegalMoves(pos: Chess): NormalMove[] {
  const promotionRoles: Role[] = ["queen", "knight", "rook", "bishop"]
  let res: NormalMove[] = []
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

/** Convenience method to get a chessops Chess object from a FEN string. */
export function chessFromFen(fen: string) {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

/** Represents a score in white's perspective. */
export function scoreWhitePov(turn: "w" | "b", score: Score) {
  if (score === undefined) return score
  return turn === "b" ? { ...score, value: -score.value } : score
}

/** Formats a score. */
export function formatScore(turn: "w" | "b", score: Score) {
  if (!score) return ""
  if (!isFinite(score.value)) return ""
  const w = scoreWhitePov(turn, score)
  switch (score.type) {
    case "cp": {
      const value = w.value / 100
      return value === 0 ? "0.00" : value < 0 ? `−${(-value).toFixed(2)}` : `+${value.toFixed(2)}`
    }
    case "mate": {
      const value = w.value
      return value < 0 ? `−#${-value}` : value > 0 ? `#${value}` : ""
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

interface MoveQuality {
  color: string
  threshold: number
  annotation: string
}

export const moveQualities: { [key: string]: MoveQuality } = {
  best: {
    color: "hsl(190 65% 65%)",
    threshold: 0,
    annotation: "妙"
  },
  good: {
    color: "hsl(120 50% 60%)",
    threshold: 0.05,
    annotation: "✓"
  },
  inaccuracy: {
    color: "hsl(60 50% 60%)",
    threshold: 0.1,
    annotation: "?!"
  },
  mistake: {
    color: "hsl(30 50% 60%)",
    threshold: 0.2,
    annotation: "?"
  },
  blunder: {
    color: "hsl(0 50% 60%)",
    threshold: 1,
    annotation: "??"
  },
  unknown: {
    color: "hsl(100 50% 30%)",
    threshold: 9001,
    annotation: ""
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
  for (const [k, v] of Object.entries(moveQualities)) {
    if (loss <= v.threshold) {
      return k
    }
  }
}

/** Returns the color of a move based on its classification. */
export function moveQuality(score: Score, best: Score) {
  return moveQualities[classifyMove(score, best)]
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

/**
 * Checks there exists a brilliant move. The requirements are:
 * - The position is not super-losing (i.e. cp >= -500)
 * - Every human move with ≥ 3% probability is an inaccuracy or worse.
 */
export function existsBrilliantMove(data: NodeData, humanProbThreshold = 0.03) {
  const best = data.eval
  // If the position is super-losing (cp < -500) then there can't be a brilliant move.
  if (best === undefined || (best.type === "mate" && best.value < 0) || best.value < -500) return false
  const hasObviousGoodMove = data.moveAnalyses.some(
    ([, a]) =>
      humanProbability(a) >= humanProbThreshold && (a.score === undefined || moveQuality(a.score, best).threshold < 0.1)
  )
  return !hasObviousGoodMove
}

/** Checks if the text input is currently focused. */
export function isTextFocused() {
  const el = document.activeElement
  return (
    el &&
    ((el.tagName === "INPUT" &&
      !["checkbox", "radio", "button", "submit", "color", "range", "file"].includes(el["type"])) ||
      el.tagName === "TEXTAREA" ||
      el["isContentEditable"])
  )
}
