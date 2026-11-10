<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    // Same persisted choice as the player (modplayjs-theme).
    const saved = localStorage.getItem('modplayjs-theme');
    document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  });
</script>

<header class="border-b border-base-300">
  <div class="mx-auto w-full max-w-5xl px-3 lg:px-5 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
    <a class="font-bold tracking-tight leading-none" href="/">
      modplay<span class="text-secondary">js</span>
    </a>
    <span class="badge badge-ghost badge-sm font-mono">studio</span>
    <a class="link link-hover text-xs opacity-60 ml-auto" href="/">← player</a>
  </div>
</header>

<main class="mx-auto w-full max-w-5xl px-3 lg:px-5 py-10 lg:py-16">
  <div class="max-w-2xl">
    <p class="font-mono text-[0.66rem] uppercase tracking-[0.2em] opacity-40">coming soon</p>
    <h1 class="mt-3 text-3xl lg:text-4xl font-bold tracking-tight">
      The studio is not open yet.
    </h1>
    <p class="mt-4 text-base leading-relaxed opacity-70">
      An in-browser tracker for building modules from scratch, running on the same engine as the
      player. It is still being built, so there is nothing to open here.
    </p>
    <p class="mt-2 text-base leading-relaxed opacity-70">
      The player is ready now: drop a MOD, S3M, XM, IT, MTM, STM, 669, MED, MO3, FC or SID file and
      it plays.
    </p>
    <div class="mt-8 flex flex-wrap items-center gap-3">
      <a class="btn btn-primary btn-sm" href="/">open the player</a>
      <a class="btn btn-ghost btn-sm" href="https://github.com/modplayjs/modplayjs" rel="noreferrer"
        >source</a
      >
    </div>
  </div>
</main>

<footer class="mx-auto w-full max-w-5xl px-3 lg:px-5 pb-6 pt-2 text-[0.7rem] opacity-60">
  <a class="link link-hover" href="/privacy.html">privacy policy</a>
</footer>
