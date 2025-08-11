import type { AppConfig } from "../../main/config"

export class Config {
  #value: AppConfig = $state()

  constructor() {
    window.api.config.get().then((value: AppConfig) => {
      this.#value = value
    })
  }

  get value() {
    return this.#value
  }

  set value(newValue) {
    this.#value = newValue
    window.api.config.set(this.#value)
  }
}

export const config = new Config()
