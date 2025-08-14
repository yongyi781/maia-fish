import { defaultConfig, type AppConfig } from "../../shared/config"

export class Config {
  value = $state(defaultConfig)
  promise: Promise<void> = window.api.config.get().then((value: AppConfig) => {
    this.value = value
  })
}

export const config = new Config()
