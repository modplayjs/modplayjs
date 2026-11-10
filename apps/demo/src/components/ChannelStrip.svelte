<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<div id="chanstrip" class="flex flex-wrap gap-1 ml-auto">
  {#each player.channels as channel (channel.i)}
    <button
      class="badge cursor-pointer select-none {channel.muted
        ? 'badge-error badge-outline'
        : 'badge-ghost'}"
      title={channel.muted ? `unmute channel ${channel.i + 1}` : `mute channel ${channel.i + 1}`}
      aria-pressed={channel.muted}
      aria-label={`channel ${channel.i + 1}${channel.muted ? ' muted' : ''}`}
      onclick={() => player.toggleChannel(channel.i)}
    >
      C{channel.i + 1}
    </button>
  {/each}
</div>
