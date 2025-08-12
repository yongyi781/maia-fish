<script lang="ts">
  import { config } from "../config.svelte"
  import { Engine } from "../engine.svelte"

  interface Props {
    engine: Engine
    onapply?: () => void
  }

  const { engine, onapply }: Props = $props()

  let needsRestart = false
  const hashSizes = [128, 256, 512, 1024, 2048, 4096]

  async function applySettings() {
    if (needsRestart) {
      engine.status = "unloaded"
      await engine.start(config.value.engine.path)
      needsRestart = false
    } else {
      await engine.stop(false)
      engine.setOption("Threads", config.value.engine.threads.toString())
      engine.setOption("Hash", config.value.engine.hash.toString())
      engine.setOption("MultiPV", config.value.engine.multiPV.toString())
      if (engine.analyzing) engine.go()
    }
  }
</script>

{#await config.promise}
  <p>Loading config...</p>
{:then}
  <div class="rounded-lg bg-gray-800 p-4 text-white">
    <div class="space-y-4">
      <!-- File Path -->
      <div class="flex items-center justify-between">
        <label for="engine-path" class="font-medium">Engine Path</label>
        <div class="flex items-center space-x-2">
          <input
            type="text"
            id="engine-path"
            readonly
            class="w-48 rounded bg-gray-700 px-2 py-1 font-mono text-sm"
            bind:value={config.value.engine.path}
          />
          <button
            class="rounded-md bg-blue-600 px-4 py-1 font-semibold hover:bg-blue-700"
            onclick={async () => {
              const path = await window.api.engine.choose()
              if (path && path !== config.value.engine.path) {
                needsRestart = true
                config.value.engine.path = path
              }
            }}
          >
            Browse
          </button>
        </div>
      </div>
      <!-- Threads -->
      <div class="flex items-center justify-between">
        <label for="threads" class="font-medium">Threads</label>
        <div class="flex items-center space-x-2">
          <input
            type="range"
            id="threads"
            name="threads"
            min="1"
            max="32"
            bind:value={config.value.engine.threads}
            class="h-2 w-48 cursor-pointer appearance-none rounded-lg bg-gray-700"
          />
          <span class="w-12 rounded bg-gray-700 px-2 py-1 text-center font-mono text-sm">
            {config.value.engine.threads}
          </span>
        </div>
      </div>

      <!-- Hash -->
      <div class="flex items-center justify-between">
        <label for="hash" class="font-medium">Hash (MB)</label>
        <div class="flex flex-wrap items-center gap-1 rounded-md bg-gray-700 p-1">
          {#each hashSizes as size (size)}
            <button
              class="rounded px-2 py-1 font-mono text-sm transition-colors {config.value.engine.hash === size
                ? 'bg-blue-600'
                : 'hover:bg-gray-600'}"
              onclick={() => (config.value.engine.hash = size)}
            >
              {size}
            </button>
          {/each}
        </div>
      </div>

      <!-- MultiPV -->
      <div class="flex items-center justify-between">
        <label for="multipv" class="font-medium">MultiPV</label>
        <div class="flex items-center space-x-2">
          <input
            type="range"
            id="multipv"
            name="multipv"
            min="1"
            max="256"
            bind:value={config.value.engine.multiPV}
            class="h-2 w-48 cursor-pointer appearance-none rounded-lg bg-gray-700"
          />
          <span class="w-12 rounded bg-gray-700 px-2 py-1 text-center font-mono text-sm">
            {config.value.engine.multiPV}
          </span>
        </div>
      </div>
      <div class="flex justify-end pt-2">
        <button
          class="rounded-md bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700"
          onclick={() => {
            applySettings()
            onapply?.()
          }}>Apply</button
        >
      </div>
    </div>
  </div>
{/await}
