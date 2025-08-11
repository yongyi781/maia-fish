import "../../main/types"

/** Evaluation score. */
export type Score = {
  type: "cp" | "mate"
  value: number
  bound?: "lower" | "upper"
}
