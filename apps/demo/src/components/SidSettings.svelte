<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300" id="sidsection">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">SID settings</h2>
    <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-[0.72rem]">
      <span class="opacity-60">chip</span>
      <select
        class="select select-sm w-full"
        value={player.sidModel}
        onchange={(event) => {
          player.sidModel = event.currentTarget.value;
          void player.reinitSidEngine();
        }}
      >
        <option value="0">header default</option>
        <option value="6581">MOS 6581</option>
        <option value="8580">MOS 8580</option>
      </select>
      <span class="opacity-60">video</span>
      <select
        class="select select-sm w-full"
        value={player.sidVideo}
        onchange={(event) => {
          player.sidVideo = event.currentTarget.value;
          void player.reinitSidEngine();
        }}
      >
        <option value="">header default</option>
        <option value="0">NTSC</option>
        <option value="1">PAL</option>
      </select>
      <span
        class="opacity-60"
        title="Light = sample-rate wave generation. HQ = cycle-based oversampled waveforms (cleaner combined waves)."
        >quality</span
      >
      <select
        class="select select-sm w-full"
        title="Light = sample-rate wave generation. HQ = cycle-based oversampled waveforms (cleaner combined waves)."
        value={player.sidQuality}
        onchange={(event) => {
          player.sidQuality = event.currentTarget.value;
          player.applySidLive();
        }}
      >
        <option value="light">light</option>
        <option value="hq">high quality</option>
        <option value="sinc">high quality + sinc resampler</option>
      </select>
      <span class="opacity-60" title="Channel mode for 2SID/3SID/4SID tunes">channels</span>
      <select
        class="select select-sm w-full"
        title={player.sidStereoDisabled
          ? 'This tune uses a single SID chip — mono/stereo routing does not apply'
          : 'Channel mode for multi-SID tunes'}
        disabled={player.sidStereoDisabled}
        value={player.sidStereo}
        onchange={(event) => {
          player.sidStereo = event.currentTarget.value;
          player.applySidLive();
        }}
      >
        <option value="0">mono</option>
        <option value="1">stereo</option>
        <option value="3">narrow stereo</option>
      </select>
      <span class="opacity-60">engine vol</span>
      <input
        type="range"
        class="range range-sm"
        min="0"
        max="255"
        value={player.sidVolume}
        oninput={(event) => {
          player.sidVolume = Number(event.currentTarget.value);
          player.applySidLive();
        }}
      />
    </div>
  </div>
</section>
