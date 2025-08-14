import prettier from "@electron-toolkit/eslint-config-prettier"
import ts from "@electron-toolkit/eslint-config-ts"
import { includeIgnoreFile } from "@eslint/compat"
import js from "@eslint/js"
import svelte from "eslint-plugin-svelte"
import svelteConfig from "./svelte.config.mjs"
import { fileURLToPath } from "node:url"

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url))

export default ts.config(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-undef": "off",
      "svelte/prefer-svelte-reactivity": "off"
    }
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig
      }
    }
  }
)
