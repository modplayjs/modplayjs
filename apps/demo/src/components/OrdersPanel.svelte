<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { fmtPad } from '../lib/format';
  import { keepInView } from '../lib/scroll';

  let listEl: HTMLDivElement;

  // Keep the active order visible inside the panel (never scroll the page).
  $effect(() => {
    const current = player.currentOrder;
    if (!player.follow || current < 0 || !listEl) return;
    const el = listEl.querySelector('.cur');
    if (el instanceof HTMLElement) keepInView(listEl, el, true);
  });
</script>

<section class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">orders</h2>
    <div
      id="ordlist"
      class="font-mono text-[0.7rem] leading-relaxed overflow-auto max-h-48 flex flex-wrap gap-x-2 gap-y-0.5"
      bind:this={listEl}
    >
      {#if player.orders.length === 0}
        <span>—</span>
      {:else}
        {#each player.orders as order (order.i)}
          <span class:cur={order.i === player.currentOrder}
            >{fmtPad(order.i, 2)}:{fmtPad(order.pat, 2)}</span
          >
        {/each}
      {/if}
    </div>
  </div>
</section>
