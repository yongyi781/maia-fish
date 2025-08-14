import ts from "@electron-toolkit/eslint-config-ts"
import prettier from "@electron-toolkit/eslint-config-prettier"
import svelte from "eslint-plugin-svelte"
import svelteConfig from "./svelte.config.mjs"

export default ts.config(
  { ignores: ["**/node_modules", "**/dist", "**/out"] },
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
