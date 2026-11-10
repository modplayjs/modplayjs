<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { fmtPad } from '../lib/format';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">instruments</h2>
    <div
      id="inslist"
      class="font-mono text-[0.7rem] leading-relaxed overflow-auto max-h-56 flex flex-col gap-0.5"
    >
      {#if player.instruments.length === 0}
        <span>—</span>
      {:else}
        {#each player.instruments as instrument (instrument.i)}
          <div class="flex items-center gap-2 font-mono text-xs leading-6">
            <button
              class="btn btn-xs btn-ghost btn-circle"
              title={`audition instrument ${instrument.i + 1}`}
              aria-label={`play instrument ${instrument.i + 1}`}
              disabled={!player.loaded}
              onclick={() => void player.auditionInstrument(instrument.i)}>▶</button
            >
            <span>{fmtPad(instrument.i + 1, 2)} {instrument.name || ' '}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</section>
