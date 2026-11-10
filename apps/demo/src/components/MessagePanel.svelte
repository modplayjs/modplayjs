<script lang="ts">
  import { player } from '../lib/player.svelte';
</script>

<section class="card bg-base-100 shadow-sm border border-base-300" id="messagesection">
  <div class="card-body p-3 gap-2">
    <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">message</h2>
    <pre
      id="message"
      class="m-0 whitespace-pre-wrap font-mono text-[0.7rem] leading-relaxed overflow-auto max-h-64 text-center">{player.message}</pre>
  </div>
</section>
