export const CONFIG_VERSION = 1

export const defaultConfig = {
  version: CONFIG_VERSION,
  nodes: 1000000,
  lichessThreshold: 1000,
  lichessBookSpeeds: ["blitz", "rapid", "classical", "correspondence"],
  lichessBookRatings: [1600, 1800, 2000, 2200, 2500],
  humanSort: false,
  hideLinesForWhite: false,
  hideLinesForBlack: false,
  autoAnalyzeDepthLimit: 12,
  analysisUpdateIntervalMs: 40,
  maiaBookPliesLimit: 20,
  /** The threshold of human probability for a move to be considered "brilliant". */
  brilliantMoveThreshold: 0.03,
  engine: {
    path: "",
    threads: 2,
    hash: 256,
    multiPV: 256
  }
}

export type AppConfig = typeof defaultConfig
