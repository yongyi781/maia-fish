import type { AppConfig } from "../../main/config"

export class Config {
  value: Partial<AppConfig> = $state({})

  constructor() {
    window.api.config.get().then((value: AppConfig) => {
      this.value = value
    })
  }
}

export const config = new Config()
