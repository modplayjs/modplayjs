<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">samples</h2>
    <div
      id="samplist"
      class="font-mono text-[0.7rem] leading-relaxed overflow-auto max-h-56 flex flex-col gap-0.5"
    >
      {#if player.samples.length === 0}
        <span>—</span>
      {:else}
        {#each player.samples as sample (sample.i)}
          <div class="flex items-center gap-2 font-mono text-xs leading-6">
            <button
              class="btn btn-xs btn-ghost btn-circle"
              title={`audition sample ${sample.i + 1}`}
              aria-label={`play sample ${sample.i + 1}`}
              disabled={!player.loaded || sample.mappedIns < 0}
              onclick={() => void player.auditionSample(sample)}>▶</button
            >
            <span>{sample.label}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</section>
