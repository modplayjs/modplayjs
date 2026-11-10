<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    const saved = localStorage.getItem('modplayjs-theme');
    document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  });
</script>

<header class="border-b border-base-300">
  <div class="mx-auto w-full max-w-5xl px-3 lg:px-5 py-3 flex items-center gap-x-3">
    <a class="font-bold tracking-tight leading-none" href="/">
      modplay<span class="text-secondary">js</span>
    </a>
    <span class="badge badge-ghost badge-sm font-mono">404</span>
  </div>
</header>

<main class="mx-auto w-full max-w-5xl px-3 lg:px-5 py-10 lg:py-16">
  <p class="font-mono text-[0.66rem] uppercase tracking-[0.2em] opacity-40">not found</p>
  <h1 class="mt-3 text-3xl lg:text-4xl font-bold tracking-tight">This page does not exist.</h1>
  <p class="mt-4 text-base leading-relaxed opacity-70">
    The address is wrong or the file was never here. The player is one link away.
  </p>
  <div class="mt-8 flex flex-wrap items-center gap-3">
    <a class="btn btn-primary btn-sm" href="/">open the player</a>
  </div>
</main>
