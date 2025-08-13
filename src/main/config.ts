import { app } from "electron"
import { join } from "path"
import { readFileSync, writeFileSync, existsSync } from "fs"

const CONFIG_VERSION = 2

const defaultConfig = {
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
  engine: {
    path: "",
    threads: 2,
    hash: 256,
    multiPV: 256
  }
}

export type AppConfig = typeof defaultConfig

export const configPath = join(app.getPath("userData"), "config.json")

export function loadConfig(): AppConfig {
  try {
    if (!existsSync(configPath)) {
      saveConfig(defaultConfig)
      return { ...defaultConfig }
    }

    const raw = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(raw)

    const merged = {
      ...defaultConfig,
      ...parsed
    }

    // Optional: handle version upgrades here
    if (merged.version !== CONFIG_VERSION) {
      console.warn(`Config version mismatch. Upgrading from ${merged.version} → ${CONFIG_VERSION}`)
      merged.version = CONFIG_VERSION
      saveConfig(merged)
    }

    return merged
  } catch (err) {
    console.error("Failed to load config, falling back to defaults:", err)
    saveConfig(defaultConfig)
    return { ...defaultConfig }
  }
}

export function saveConfig(config: AppConfig) {
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}
