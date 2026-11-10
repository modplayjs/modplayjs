<script lang="ts">
  import { player } from '../lib/player.svelte';
  import { fmtBytes } from '../lib/format';

  let dragging = $state(false);

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void player.addFiles(files);
  }

  function open(trackId: number): void {
    const track = player.tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (player.playing || player.paused) void player.playTrack(track);
    else void player.selectTrack(track);
  }
</script>

<section
  class="card bg-base-100 shadow-sm border {dragging ? 'border-primary' : 'border-base-300'}"
  id="playlistcard"
  aria-label="playlist"
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <div class="card-body p-3 gap-2">
    <div class="flex items-center justify-between">
      <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">playlist</h2>
      <div class="flex items-center gap-1">
        <span id="plsize" class="text-[0.65rem] opacity-50 font-mono" title="cached bytes"
          >{player.playlistSize}</span
        >
        <button
          class="btn btn-ghost btn-xs"
          title="Remove all entries"
          disabled={player.tracks.length === 0}
          onclick={() => void player.clearPlaylist()}
        >
          clear
        </button>
      </div>
    </div>
    <div
      id="pllist"
      class="flex flex-col gap-0.5 overflow-auto max-h-56 -mx-1 px-1"
      role="listbox"
      aria-label="playlist"
    >
      {#if player.tracks.length === 0}
        <div id="plempty" class="text-[0.72rem] opacity-50 py-2 text-center">
          drop module files here or use the file picker
        </div>
      {/if}
      {#each player.tracks as track (track.id)}
        {@const selected = player.currentTrackId === track.id}
        <div
          class="flex items-center gap-2 rounded px-1.5 py-1 text-[0.72rem] cursor-pointer hover:bg-base-200 {selected
            ? 'bg-primary/15 outline outline-1 outline-primary/40'
            : ''}"
          role="option"
          aria-selected={selected}
          tabindex="0"
          title={`${track.name} — click to play`}
          onclick={() => open(track.id)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open(track.id);
            }
          }}
        >
          <span class="badge badge-ghost badge-xs font-mono shrink-0 uppercase">{track.format}</span>
          <span class="truncate grow min-w-0">{track.name}</span>
          <span class="opacity-50 font-mono shrink-0">{fmtBytes(track.size)}</span>
          <button
            class="btn btn-ghost btn-xs px-1 shrink-0 opacity-60 hover:opacity-100"
            aria-label={`remove ${track.name}`}
            onclick={(event) => {
              event.stopPropagation();
              void player.removeTrack(track.id);
            }}>✕</button
          >
        </div>
      {/each}
    </div>
  </div>
</section>
