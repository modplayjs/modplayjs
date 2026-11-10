<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">
      file information
    </h2>
    <div id="info" class="overflow-auto max-h-[26rem] text-[0.72rem] leading-relaxed">
      {#if player.infoRows.length === 0}
        <span>—</span>
      {:else}
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {#each player.infoRows as row (row.label)}
            <span class="opacity-60">{row.label}</span>
            <span class="font-medium break-all" title={row.value}>{row.value}</span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>
