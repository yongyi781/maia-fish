import { Chess, Move, Role, squareRank } from "chessops"
import { Score } from "./types"
import { parseFen } from "chessops/fen"

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

/** Returns all legal moves from a position. */
export function legalMoves(pos: Chess): Move[] {
  const promotionRoles: Role[] = ["queen", "knight", "rook", "bishop"]
  let res: Move[] = []
  for (const [from, dests] of pos.allDests()) {
    const promotions: Array<Role | undefined> =
      squareRank(from) === (pos.turn === "white" ? 6 : 1) && pos.board.pawn.has(from) ? promotionRoles : [undefined]
    for (const to of dests) {
      for (const promotion of promotions) {
        res.push({ from, to, promotion })
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
