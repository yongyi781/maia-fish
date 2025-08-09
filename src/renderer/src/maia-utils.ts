import { Chess, makeUci } from "chessops"
import { parseFen } from "chessops/fen"
import { Tensor } from "onnxruntime-node"
import allPossibleMovesDict from "./all_moves.json"
import allPossibleMovesReversedDict from "./all_moves_reversed.json"
import { allLegalMoves } from "./utils"

const allPossibleMoves = allPossibleMovesDict as Record<string, number>
const allPossibleMovesReversed = allPossibleMovesReversedDict as Record<number, string>

const eloDict = createEloDict()

/**
 * Mirrors a chess move in UCI notation.
 * The move is mirrored vertically (top-to-bottom flip) on the board.
 *
 * @param moveUci - The move to be mirrored in UCI notation.
 * @returns The mirrored move in UCI notation.
 */
function mirrorMove(moveUci: string): string {
  const isPromotion: boolean = moveUci.length > 4

  const startSquare: string = moveUci.substring(0, 2)
  const endSquare: string = moveUci.substring(2, 4)
  const promotionPiece: string = isPromotion ? moveUci.substring(4) : ""

  const mirroredStart: string = mirrorSquare(startSquare)
  const mirroredEnd: string = mirrorSquare(endSquare)

  return mirroredStart + mirroredEnd + promotionPiece
}

/**
 * Mirrors a square on the chess board vertically (top-to-bottom flip).
 * The file remains the same, while the rank is inverted.
 *
 * @param square - The square to be mirrored in algebraic notation.
 * @returns The mirrored square in algebraic notation.
 */
function mirrorSquare(square: string): string {
  const file: string = square.charAt(0)
  const rank: string = (9 - parseInt(square.charAt(1))).toString()

  return file + rank
}

/**
 * Swaps the colors of pieces in a rank by changing uppercase to lowercase and vice versa.
 * @param rank The rank to be mirrored.
 * @returns The mirrored rank.
 */
function swapColorsInRank(rank: string): string {
  let swappedRank = ""
  for (const char of rank) {
    if (/[A-Z]/.test(char)) {
      swappedRank += char.toLowerCase()
    } else if (/[a-z]/.test(char)) {
      swappedRank += char.toUpperCase()
    } else {
      // Numbers representing empty squares
      swappedRank += char
    }
  }
  return swappedRank
}

function swapCastlingRights(castling: string): string {
  if (castling === "-") return "-"

  // Capture the current rights in a Set.
  const rights = new Set(castling.split(""))
  const swapped = new Set<string>()

  // Swap white and black castling rights.
  if (rights.has("K")) swapped.add("k")
  if (rights.has("Q")) swapped.add("q")
  if (rights.has("k")) swapped.add("K")
  if (rights.has("q")) swapped.add("Q")

  // Output in canonical order: white kingside, white queenside, black kingside, black queenside.
  let output = ""
  if (swapped.has("K")) output += "K"
  if (swapped.has("Q")) output += "Q"
  if (swapped.has("k")) output += "k"
  if (swapped.has("q")) output += "q"

  return output === "" ? "-" : output
}

/**
 * Mirrors a FEN string vertically (top-to-bottom flip) while swapping piece colors.
 * Additionally, the active color, castling rights, and en passant target are adjusted accordingly.
 *
 * @param fen - The FEN string to be mirrored.
 * @returns The mirrored FEN string.
 */
function mirrorFEN(fen: string): string {
  const [position, activeColor, castling, enPassant, halfmove, fullmove] = fen.split(" ")

  // Mirror board rows vertically and swap piece colors.
  const ranks = position.split("/")
  const mirroredRanks = ranks
    .slice()
    .reverse()
    .map((rank) => swapColorsInRank(rank))
  const mirroredPosition = mirroredRanks.join("/")

  // Swap active color.
  const mirroredActiveColor = activeColor === "w" ? "b" : "w"

  // Swap castling rights.
  const mirroredCastling = swapCastlingRights(castling)

  // Mirror en passant target square.
  const mirroredEnPassant = enPassant !== "-" ? mirrorSquare(enPassant) : "-"

  return `${mirroredPosition} ${mirroredActiveColor} ${mirroredCastling} ${mirroredEnPassant} ${halfmove} ${fullmove}`
}

/**
 * Borrowed from https://github.com/CSSLab/maia-platform-frontend/blob/main/src/providers/MaiaEngineContextProvider/utils.ts.
 * Converts a chess board position in FEN notation to a tensor representation.
 * The tensor includes information about piece placement, active color, castling rights, and en passant target.
 *
 * @param fen - The FEN string representing the chess board position.
 * @returns A Float32Array representing the tensor of the board position.
 */
function boardToTensor(fen: string): Float32Array {
  const tokens = fen.split(" ")
  const piecePlacement = tokens[0]
  const activeColor = tokens[1]
  const castlingAvailability = tokens[2]
  const enPassantTarget = tokens[3]

  const pieceTypes = ["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
  const tensor = new Float32Array(18 * 8 * 8)

  const rows = piecePlacement.split("/")

  // Adjust rank indexing
  for (let rank = 0; rank < 8; rank++) {
    const row = 7 - rank
    let file = 0
    for (const char of rows[rank]) {
      const skip = parseInt(char)
      if (isNaN(skip)) {
        const index = pieceTypes.indexOf(char)
        const tensorIndex = index * 64 + row * 8 + file
        tensor[tensorIndex] = 1.0
        ++file
      } else {
        file += skip
      }
    }
  }

  // Player's turn channel
  const turnChannelStart = 12 * 64
  const turnChannelEnd = turnChannelStart + 64
  const turnValue = activeColor === "w" ? 1.0 : 0.0
  tensor.fill(turnValue, turnChannelStart, turnChannelEnd)

  // Castling rights channels
  const castlingRights = [
    castlingAvailability.includes("K"),
    castlingAvailability.includes("Q"),
    castlingAvailability.includes("k"),
    castlingAvailability.includes("q")
  ]
  for (let i = 0; i < 4; i++) {
    if (castlingRights[i]) {
      const channelStart = (13 + i) * 64
      const channelEnd = channelStart + 64
      tensor.fill(1.0, channelStart, channelEnd)
    }
  }

  // En passant target channel
  const epChannel = 17 * 64
  if (enPassantTarget !== "-") {
    const file = enPassantTarget.charCodeAt(0) - "a".charCodeAt(0)
    const rank = parseInt(enPassantTarget[1], 10) - 1 // Adjust rank indexing
    const row = 7 - rank // Invert rank to match tensor indexing
    const index = epChannel + row * 8 + file
    tensor[index] = 1.0
  }

  return tensor
}

/**
 * Maps an Elo rating to a predefined category based on specified intervals.
 *
 * @param elo - The Elo rating to be categorized.
 * @param eloDict - A dictionary mapping Elo ranges to category indices.
 * @returns The category index corresponding to the given Elo rating.
 * @throws Will throw an error if the Elo value is out of the predefined range.
 */
function mapToCategory(elo: number, eloDict: Record<string, number>): number {
  const interval = 100
  const start = 1100
  const end = 2000

  if (elo < start) {
    return eloDict[`<${start}`]
  } else if (elo >= end) {
    return eloDict[`>=${end}`]
  } else {
    for (let lowerBound = start; lowerBound < end; lowerBound += interval) {
      const upperBound = lowerBound + interval
      if (elo >= lowerBound && elo < upperBound) {
        return eloDict[`${lowerBound}-${upperBound - 1}`]
      }
    }
  }
  throw new Error("Elo value is out of range.")
}

/**
 * Creates a dictionary mapping Elo rating ranges to category indices.
 *
 * @returns A dictionary mapping Elo ranges to category indices.
 */
function createEloDict(): { [key: string]: number } {
  const interval = 100
  const start = 1100
  const end = 2000

  const eloDict: { [key: string]: number } = { [`<${start}`]: 0 }
  let rangeIndex = 1

  for (let lowerBound = start; lowerBound < end; lowerBound += interval) {
    const upperBound = lowerBound + interval
    eloDict[`${lowerBound}-${upperBound - 1}`] = rangeIndex
    ++rangeIndex
  }

  eloDict[`>=${end}`] = rangeIndex

  return eloDict
}

/**
 * Preprocesses the input data for the model.
 * Converts the FEN string, Elo ratings, and legal moves into tensors.
 *
 * @param fen - The FEN string representing the board position.
 * @param eloSelf - The Elo rating of the player.
 * @param eloOppo - The Elo rating of the opponent.
 * @returns An object containing the preprocessed data.
 */
export function preprocess(
  fen: string,
  eloSelf: number,
  eloOppo: number
): {
  boardInput: Float32Array
  eloSelfCategory: number
  eloOppoCategory: number
  legalMoves: Float32Array
} {
  // Handle mirroring if it's black's turn
  if (fen.split(" ")[1] === "b") {
    fen = mirrorFEN(fen)
  } else if (fen.split(" ")[1] !== "w") {
    throw new Error(`Invalid FEN: ${fen}`)
  }

  // Convert board to tensor
  const boardInput = boardToTensor(fen)

  // Map Elo to categories
  const eloSelfCategory = mapToCategory(eloSelf, eloDict)
  const eloOppoCategory = mapToCategory(eloOppo, eloDict)

  // Generate legal moves tensor
  const legalMovesArr = new Float32Array(Object.keys(allPossibleMoves).length)

  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  for (let move of allLegalMoves(pos)) {
    const moveIndex = allPossibleMoves[makeUci(move)]
    if (moveIndex !== undefined) {
      legalMovesArr[moveIndex] = 1.0
    }
  }

  return {
    boardInput,
    eloSelfCategory,
    eloOppoCategory,
    legalMoves: legalMovesArr
  }
}

/**
 * Processes the outputs of the ONNX model to compute the policy and value.
 *
 * @param fen - The FEN string representing the current board state.
 * @param logits_maia - The logits tensor for the policy output from the model.
 * @param logits_value - The logits tensor for the value output from the model.
 * @param legalMoves - An array indicating the legal moves.
 * @returns An object containing the policy (move probabilities) and the value (win probability).
 */
export function processOutputs(
  fen: string,
  logits_maia: Tensor,
  logits_value: Tensor,
  legalMoves: Float32Array
): { policy: Record<string, number>; value: number } {
  const logits = logits_maia["cpuData"] as Float32Array
  const value = logits_value["cpuData"] as Float32Array

  let winProb = Math.min(Math.max((value[0] as number) / 2 + 0.5, 0), 1)

  let black_flag = false
  if (fen.split(" ")[1] === "b") {
    black_flag = true
    winProb = 1 - winProb
  }

  winProb = Math.round(winProb * 10000) / 10000

  // Get indices of legal moves
  const legalMoveIndices = legalMoves.map((value, index) => (value > 0 ? index : -1)).filter((index) => index !== -1)

  const legalMovesMirrored: string[] = []
  for (const moveIndex of legalMoveIndices) {
    let move = allPossibleMovesReversed[moveIndex]
    if (black_flag) {
      move = mirrorMove(move)
    }

    legalMovesMirrored.push(move)
  }

  // Extract logits for legal moves
  const legalLogits = legalMoveIndices.map((idx) => logits[idx])

  // Compute softmax over the legal logits
  const maxLogit = Math.max(...legalLogits)
  const expLogits = legalLogits.map((logit) => Math.exp(logit - maxLogit))
  const sumExp = expLogits.reduce((a, b) => a + b, 0)
  const probs = expLogits.map((expLogit) => expLogit / sumExp)
  // Map the probabilities back to their move indices
  const moveProbs: Record<string, number> = {}
  for (let i = 0; i < legalMoveIndices.length; i++) {
    moveProbs[legalMovesMirrored[i]] = probs[i]
  }
  return { policy: moveProbs, value: winProb }
}
