<script lang="ts">
  import ChannelStrip from './ChannelStrip.svelte';
  import { player } from '../lib/player.svelte';

  let fileInput: HTMLInputElement;

  function onFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    void player.addFiles(files);
  }
</script>

<header
  id="playerbar"
  class="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur"
>
  <div class="w-full px-3 lg:px-5 py-2.5 flex flex-col gap-2">
    <!-- row 1: identity + file + transport -->
    <div class="flex items-center gap-x-3 gap-y-2 flex-wrap">
      <span class="font-bold tracking-tight leading-none">
        modplay<span class="text-secondary">js</span>
      </span>
      <span id="buildhash" class="badge badge-ghost badge-sm font-mono" title="build"
        >{player.buildHash}</span
      >

      <label class="sr-only" for="file">Module files</label>
      <input
        type="file"
        id="file"
        multiple
        accept=".mod,.mmd,.mmd0,.mmd1,.mmd2,.mmd3,.mmdc,.med,.med2,.med3,.med4,.s3m,.xm,.it,.mtm,.stm,.669,.sfx,.digi,.asylum,.ice,.st,.mo3,.fc13,.fc14,.sid,.pow,.pp,.xpk,.pack,.p61,.utz,.wav,.mp3,.ogg"
        class="sr-only"
        bind:this={fileInput}
        onchange={onFiles}
      />

      <button
        type="button"
        class="btn btn-ghost btn-sm"
        title="Add module files to the playlist"
        onclick={() => fileInput.click()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="size-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
        </svg>
        add files
      </button>

      <div class="join ml-auto">
        <button
          id="play"
          class="btn btn-primary btn-sm join-item w-16"
          disabled={!player.loaded || (player.playing && !player.paused)}
          onclick={() => void player.play()}
        >
          Play
        </button>
        <button
          id="pause"
          class="btn btn-sm join-item w-16"
          disabled={!player.playing}
          onclick={() => player.pause()}
        >
          {player.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          id="stop"
          class="btn btn-sm join-item w-14"
          disabled={!player.playing && !player.paused}
          onclick={() => player.stop()}
        >
          Stop
        </button>
        <button
          id="fullscreen"
          class="btn btn-sm join-item btn-square"
          class:hidden={player.fullscreenHidden}
          title="Toggle fullscreen"
          aria-label="Toggle fullscreen"
          onclick={() => player.toggleFullscreen()}
        >
          <svg
            class="size-4"
            class:hidden={player.fullscreenActive}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />
          </svg>
          <svg
            class="size-4"
            class:hidden={!player.fullscreenActive}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9 4H7v5H2v2h7V4zm12 7h-5V4h-2v7h7V7v4zM9 20H2v-7h2v5h5v2zm12-5v5h-7v-2h5v-3h2z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- row 2: seek + time + volume -->
    <div class="flex items-center gap-3">
      <span id="timecur" class="font-mono text-sm tabular-nums w-12 text-right"
        >{player.timeCurrent}</span
      >
      <input
        type="range"
        id="seek"
        min="0"
        max="1000"
        value={player.seekPct}
        disabled={player.seekDisabled}
        class="range range-xs range-primary grow"
        aria-label="Seek"
        style="--fill: {(player.seekPct / 10).toFixed(1)}%"
        oninput={(event) => player.seekDrag(Number(event.currentTarget.value))}
        onchange={(event) => player.seekCommit(Number(event.currentTarget.value))}
      />
      <span id="timerem" class="font-mono text-sm tabular-nums w-14 opacity-80"
        >{player.timeRemaining}</span
      >

      <div class="flex items-center gap-2 border-l border-base-300 pl-3 w-40 min-w-36">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="size-4 opacity-70 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM16.5 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"
          />
        </svg>
        <input
          type="range"
          id="volume"
          min="0"
          max="100"
          value={player.volume}
          class="range range-xs grow"
          aria-label="Volume"
          oninput={(event) => player.setVolume(Number(event.currentTarget.value))}
        />
        <span id="volumev" class="font-mono text-xs tabular-nums w-8 text-right opacity-80"
          >{player.volume}</span
        >
      </div>

      <label class="flex items-center gap-2 text-xs border-l border-base-300 pl-3 w-36 min-w-32">
        <span class="opacity-50">pan</span>
        <input
          type="range"
          id="pansep"
          min="0"
          max="100"
          value={player.panSep}
          disabled={player.panSepDisabled}
          class="range range-xs grow"
          aria-label="Pan separation"
          oninput={(event) => player.setPanSeparation(Number(event.currentTarget.value))}
        />
        <span id="pansepv" class="font-mono tabular-nums opacity-70 w-7 text-right"
          >{player.panSepDisabled ? 'fixed' : player.panSep}</span
        >
      </label>
    </div>

    <!-- row 3: song meta + channel strip -->
    <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs min-h-6">
      <span id="status" role="status" class="opacity-70 whitespace-pre-wrap">{player.status}</span>
      <ChannelStrip />
    </div>
  </div>
</header>
