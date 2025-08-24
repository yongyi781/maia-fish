<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements"
  import { twMerge } from "tailwind-merge"

  interface Props extends HTMLButtonAttributes {
    checked?: boolean
    class?: string
  }

  const { checked = $bindable(false), class: className = "", children, ...restProps }: Props = $props()
</script>

<button
  {...restProps}
  class={twMerge(
    "rounded-md px-2 py-1 outline outline-zinc-800 transition-colors duration-75 dark:outline-zinc-600",
    checked ? "bg-[#555577]" : "bg-[#1a202c] hover:bg-[#333355]",
    className
  )}
>
  {@render children?.()}
</button>
