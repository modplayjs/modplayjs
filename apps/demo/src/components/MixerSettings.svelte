<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300" id="mixersection">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">
      mixer settings
    </h2>
    <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-[0.72rem]">
      <span
        class="opacity-60"
        title="libxmp = exact reference software mixer. Paula = Amiga A500 BLEP resampler (4-channel MODs only)."
        >engine</span
      >
      <select
        class="select select-sm w-full"
        title="libxmp = exact reference software mixer. Paula = Amiga A500 BLEP resampler (4-channel MODs only)."
        value={player.mixerMode}
        disabled={player.mixerModeDisabled}
        onchange={(event) => void player.setMixerMode(event.currentTarget.value)}
      >
        <option value="libxmp">libxmp</option>
        <option value="paula">Paula (A500)</option>
      </select>
      <span
        class="opacity-60"
        title="Channel → speaker layout. lrlr = L R L R (Amiga hardware order). lrrl = L R R L (OpenMPT/PaulaLib default)."
        >layout</span
      >
      <select
        class="select select-sm w-full"
        title="Channel → speaker layout. lrlr = L R L R (Amiga hardware order). lrrl = L R R L (OpenMPT/PaulaLib default)."
        value={player.mixerLayout}
        onchange={(event) => {
          player.mixerLayout = event.currentTarget.value;
          player.applyMixerOptions();
        }}
      >
        <option value="panned">module pans</option>
        <option value="lrlr">L R L R</option>
        <option value="lrrl">L R R L</option>
      </select>
      <span
        class="opacity-60"
        title="Amiga 500 output filter: LED off = the fixed 4.9 kHz RC network. LED on = the dimmed-power-light 3.3 kHz Sallen-Key stage on top (Paula mode only)."
        >A500 filter</span
      >
      <select
        class="select select-sm w-full"
        title="Amiga 500 output filter: LED off = the fixed 4.9 kHz RC network. LED on = the dimmed-power-light 3.3 kHz Sallen-Key stage on top (Paula mode only)."
        value={player.mixerFilter}
        disabled={player.mixerFilterDisabled}
        onchange={(event) => {
          player.mixerFilter = event.currentTarget.value;
          player.applyMixerOptions();
        }}
      >
        <option value="a500">LED off</option>
        <option value="a500led">LED on</option>
      </select>
    </div>
  </div>
</section>
