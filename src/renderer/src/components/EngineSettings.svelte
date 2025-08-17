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
      engine.state = "unloaded"
      await engine.start()
      needsRestart = false
    } else {
      await engine.stop()
      engine.setStandardOptions()
      if (engine.analyzing) engine.go()
    }
  }
</script>

{#await config.promise}
  <p>Loading config...</p>
{:then}
  {#if config.value.engine}
    {@const eng = config.value.engine}
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
              bind:value={eng.path}
            />
            <button
              class="rounded-md bg-blue-600 px-4 py-1 font-semibold hover:bg-blue-700"
              onclick={async () => {
                const path = await window.api.engine.choose()
                if (path && path !== eng.path) {
                  needsRestart = true
                  eng.path = path
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
              bind:value={eng.threads}
              class="h-2 w-48 cursor-pointer appearance-none rounded-lg bg-gray-700"
            />
            <span class="w-12 rounded bg-gray-700 px-2 py-1 text-center font-mono text-sm">
              {eng.threads}
            </span>
          </div>
        </div>

        <!-- Hash -->
        <div class="flex items-center justify-between">
          <label for="hash" class="font-medium">Hash (MB)</label>
          <div class="flex flex-wrap items-center gap-1 rounded-md bg-gray-700 p-1">
            {#each hashSizes as size (size)}
              <button
                class="rounded px-2 py-1 font-mono text-sm transition-colors duration-75 {eng.hash === size
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-600'}"
                onclick={() => (eng.hash = size)}
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
              bind:value={eng.multiPV}
              class="h-2 w-48 cursor-pointer appearance-none rounded-lg bg-gray-700"
            />
            <span class="w-12 rounded bg-gray-700 px-2 py-1 text-center font-mono text-sm">
              {eng.multiPV}
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
  {/if}
{/await}
