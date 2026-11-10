<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">view options</h2>
    <div class="flex flex-col gap-1.5 text-xs">
      <label class="flex items-center justify-between cursor-pointer gap-2 py-0.5">
        <span class="opacity-70" title="Autoscroll pattern view and order list to the active row"
          >follow</span
        >
        <input
          type="checkbox"
          checked={player.follow}
          class="toggle toggle-sm toggle-primary"
          onchange={(event) => (player.follow = event.currentTarget.checked)}
        />
      </label>
      <label class="flex items-center justify-between cursor-pointer gap-2 py-0.5">
        <span class="opacity-70" title="Show the tracker pattern view">pattern</span>
        <input
          type="checkbox"
          checked={player.patternOn}
          class="toggle toggle-sm toggle-primary"
          onchange={(event) => player.setPatternView(event.currentTarget.checked)}
        />
      </label>
      <label
        class="flex items-center justify-between cursor-pointer gap-2 py-0.5"
        title="Hide trailing padding dots in instrument/sample names"
      >
        <span class="opacity-70">strip dots</span>
        <input
          type="checkbox"
          checked={player.stripDots}
          class="toggle toggle-sm"
          onchange={(event) => player.setStripDots(event.currentTarget.checked)}
        />
      </label>
      <label class="flex items-center justify-between cursor-pointer gap-2 py-0.5" title="Switch light/dark theme">
        <span class="opacity-70">dark</span>
        <input
          type="checkbox"
          checked={player.dark}
          class="toggle toggle-sm"
          onchange={(event) => player.setDark(event.currentTarget.checked)}
        />
      </label>
    </div>
  </div>
</section>
