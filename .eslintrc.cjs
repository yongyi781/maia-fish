module.exports = {
  root: true,
  env: {
    browser: true,
    commonjs: true,
    es2017: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2021,
    extraFileExtensions: [".svelte"]
  },
  plugins: ["svelte3", "@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:@typescript-eslint/eslint-recommended", "plugin:prettier/recommended"],
  overrides: [
    {
      files: ["*.js"],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off"
      }
    },
    {
      files: ["*.svelte"],
      processor: "svelte3/svelte3"
    }
  ],
  settings: {
    "svelte3/typescript": true
  }
}
