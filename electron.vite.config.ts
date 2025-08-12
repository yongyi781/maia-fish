import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      commonjsOptions: {
        ignoreDynamicRequires: true,
        dynamicRequireTargets: ["node_modules/onnxruntime-node/**/*"]
      },
      rollupOptions: {
        external: ["onnxruntime-node"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [svelte(), tailwindcss()]
  }
})
