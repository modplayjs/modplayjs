<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { core } from '../lib/engine';
  import { player } from '../lib/player.svelte';
  import { fmtPad, fxStr, noteStr } from '../lib/format';

  let patBody: HTMLDivElement;
  let patHead: HTMLDivElement;
  let patRows: HTMLDivElement;
  let patNum = $state('');

  let rowEls: HTMLDivElement[] = [];
  let builtOrd = -1;
  let builtVersion = -1;
  let curRow = -1;
  // Pattern row pitch in px (--row-h 1.35em × 0.78rem font, style.css).
  // Re-measured from the DOM after each build: fractional scrolling needs the
  // real pitch, and offsetHeight rounds it to an integer.
  const ROW_PX = 17;
  let rowPitch = ROW_PX;

  function buildPatternView(patternIdx: number): void {
    const mod = core.module;
    if (!mod) return;
    const pi = mod.xxo[patternIdx] ?? patternIdx;
    const pat = mod.patterns[pi];
    if (!pat) return;

    const rows = pat.rows;
    const tracks = mod.chn;
    patNum = '#' + patternIdx + ' (pattern ' + pi + ')';
    // 4 cells per track (note/ins/vol/fx) — consumed by the CSS grid template.
    for (const el of [patHead, patBody, patRows]) el.style.setProperty('--cols', String(tracks));

    let head = '<span class="cell cell-row"></span>';
    for (let c = 0; c < tracks; c++) head += '<span class="cell marker">C' + fmtPad(c + 1, 2) + '</span>';
    patHead.innerHTML = head;

    patRows.innerHTML = '';
    rowEls.length = 0;
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'prow';
      row.dataset.row = String(r);
      let html = '<span class="cell cell-row">' + fmtPad(r, 3) + '</span>';
      for (let c = 0; c < tracks; c++) {
        const e = pat.tracks[c]?.event?.[r];
        const note = e && e.note ? noteStr(e.note) : '...';
        const ins = e && e.ins ? fmtPad(e.ins, 2) : '..';
        const vol = e && e.vol ? fmtPad(Math.min(e.vol, 99), 2) : '..';
        const fxc = e && (e.fxt || e.fxp) ? fxStr(e.fxt, e.fxp) : '...';
        html +=
          '<span class="cell cell-note">' +
          note +
          '</span>' +
          '<span class="cell cell-ins">' +
          ins +
          '</span>' +
          '<span class="cell cell-vol">' +
          vol +
          '</span>' +
          '<span class="cell cell-fx">' +
          fxc +
          '</span>';
      }
      row.innerHTML = html;
      frag.appendChild(row);
      rowEls.push(row);
    }
    patRows.appendChild(frag);
    curRow = -1;
    // Measure the real row pitch for the fractional follow scroll.
    rowPitch = rowEls[0]?.getBoundingClientRect().height || ROW_PX;
    // Anchor the scroll immediately after the rebuild: the active row lands
    // ~1/3 from the top so the upcoming rows stay visible.
    patBody.scrollTop = 0;
  }

  /** Scroll driver: rAF-interpolated approach to a MOVING anchor.
   * The anchor is retargeted every frame from the audible position, so it is
   * already continuous; resuming the easing from scratch each frame would only
   * add a fixed lag behind the audio. Small residuals are therefore applied
   * directly (zero lag), while a jump — a row rebuild, a seek, a mode switch —
   * is eased over a few frames rather than snapped. */
  let glideTarget = 0;
  let glideRaf = 0;
  function glideTo(target: number): void {
    glideTarget = target;
    if (glideRaf !== 0) return; // the running loop picks the new target up
    const step = (): void => {
      const residual = glideTarget - patBody.scrollTop;
      if (Math.abs(residual) <= 4) {
        patBody.scrollTop = glideTarget;
        glideRaf = 0;
        return;
      }
      patBody.scrollTop += residual * 0.35;
      glideRaf = requestAnimationFrame(step);
    };
    glideRaf = requestAnimationFrame(step);
  }

  // The module changed (a load or a new pattern): rebuild even while stopped.
  $effect(() => {
    const version = player.patternVersion;
    if (!version) return;
    untrack(() => {
      builtVersion = version;
      builtOrd = player.currentOrder >= 0 ? player.currentOrder : 0;
      buildPatternView(builtOrd);
    });
  });

  onMount(() => {
    const off = player.onPosition((position) => {
      if (builtVersion !== player.patternVersion) {
        builtVersion = player.patternVersion;
        builtOrd = -1;
      }
      if (position.ord !== builtOrd) {
        builtOrd = position.ord;
        buildPatternView(position.ord);
      }
      if (position.row !== curRow && position.row < rowEls.length) {
        if (curRow >= 0 && curRow < rowEls.length) rowEls[curRow]!.classList.remove('active');
        curRow = position.row;
        rowEls[curRow]!.classList.add('active');
      }
      // Follow the playhead CONTINUOUSLY: rowProgress is the fraction of the
      // audible row that has played, so the scroll anchor moves at the audio
      // rate instead of stepping once per row.
      if (player.follow && curRow >= 0 && curRow < rowEls.length) {
        const frac = curRow + position.progress;
        glideTo(
          Math.max(
            0,
            Math.min(
              (frac + 0.5) * rowPitch - patBody.clientHeight / 2,
              patBody.scrollHeight - patBody.clientHeight,
            ),
          ),
        );
      }
    });
    return () => {
      off();
      cancelAnimationFrame(glideRaf);
    };
  });
</script>

<div class="flex items-center justify-between mb-2 gap-2" id="patternlegend">
  <h2 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] opacity-50">
    pattern <span id="patnum" class="badge badge-primary badge-sm align-middle font-mono"
      >{patNum}</span
    >
  </h2>
  <div
    class="hidden md:flex items-center gap-x-3 gap-y-1 text-[0.65rem] opacity-70"
    role="group"
    aria-label="column legend"
  >
    <span class="inline-flex items-center gap-1"><span class="legend-swatch cell-note">C-4</span>note</span>
    <span class="inline-flex items-center gap-1"><span class="legend-swatch cell-ins">01</span>ins</span>
    <span class="inline-flex items-center gap-1"><span class="legend-swatch cell-vol">64</span>vol</span>
    <span class="inline-flex items-center gap-1"><span class="legend-swatch cell-fx">F0A</span>fx</span>
    <span class="inline-flex items-center gap-1"><span class="legend-swatch legend-empty">...</span>—</span>
  </div>
</div>

<div class="card bg-base-100 shadow-sm border border-base-300" id="pattern">
  <div id="patbody" class="card-body p-0" role="group" aria-label="pattern data" bind:this={patBody}>
    <div id="pathead" bind:this={patHead}></div>
    <div id="patrows" bind:this={patRows}></div>
  </div>
</div>
