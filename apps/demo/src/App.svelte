<script lang="ts">
  import PlayerBar from './components/PlayerBar.svelte';
  import PlaylistCard from './components/PlaylistCard.svelte';
  import ViewOptions from './components/ViewOptions.svelte';
  import InfoPanel from './components/InfoPanel.svelte';
  import MixerSettings from './components/MixerSettings.svelte';
  import SidSettings from './components/SidSettings.svelte';
  import MessagePanel from './components/MessagePanel.svelte';
  import PatternView from './components/PatternView.svelte';
  import OrdersPanel from './components/OrdersPanel.svelte';
  import InstrumentsPanel from './components/InstrumentsPanel.svelte';
  import SamplesPanel from './components/SamplesPanel.svelte';
  import { onMount } from 'svelte';
  import { player } from './lib/player.svelte';

  onMount(() => {
    void player.init();
    return () => player.dispose();
  });
</script>

<PlayerBar />

<main class="mx-auto w-full px-3 lg:px-5 py-4">
  <div
    class="grid gap-4 grid-cols-1 items-start {player.patternOn
      ? 'lg:grid-cols-[1fr_2fr_1fr]'
      : 'lg:grid-cols-2'}"
  >
    <!-- left column: playlist + view options + file information -->
    <div class="flex flex-col gap-4 min-w-0">
      <PlaylistCard />
      <ViewOptions />
      <InfoPanel />
      {#if player.mixerVisible}
        <MixerSettings />
      {/if}
      {#if player.sidVisible}
        <SidSettings />
      {/if}
    </div>

    <!-- center column: message (when present) + pattern -->
    {#if player.patternOn}
      <section class="min-w-0 flex flex-col gap-4" id="patterncol">
        {#if player.message}
          <MessagePanel />
        {/if}
        <PatternView />
      </section>
    {/if}

    <!-- right column: orders + instruments + samples -->
    <div class="flex flex-col gap-4 min-w-0">
      <OrdersPanel />
      <InstrumentsPanel />
      <SamplesPanel />
    </div>
  </div>
</main>

<footer class="mx-auto w-full max-w-[100rem] px-3 lg:px-5 pb-6 pt-2 text-[0.7rem] opacity-60">
  <a class="link link-hover" href="/privacy.html">privacy policy</a>
  <span aria-hidden="true">·</span>
  <a class="link link-hover" href="/studio/">studio (soon)</a>
  <span aria-hidden="true">·</span>
  <a class="link link-hover" href="https://github.com/modplayjs/modplayjs">source</a>
</footer>
