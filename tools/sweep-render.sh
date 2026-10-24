#!/bin/bash
# tools/sweep-render.sh — bit-compare our render against the C reference for
# a list of modules, in parallel.
#
# usage: find <dirs> -name '*.xm' | tools/sweep-render.sh [seconds] [jobs]
#
# For each file: render `seconds` of audio at 48 kHz through the C oracle
# (tools/xmpref.c) and through our player (tools/render-ours.mjs), then
# compare the two WAVs sample-for-sample (tools/compare-wav.mjs).
#
# Prints one line per failure (modules whose C and our output differ) plus a
# final PASS/FAIL/SKIP tally on stderr. Modules the C loader rejects are
# reported as SKIP. Files whose playback is seeded from the wall clock
# (IT random pan/volume swing) can never match and must be judged by hand.
#
# Requires: /tmp/xmpref built from reference/libxmp (see README).
cd "$(dirname "$0")/.." || exit 1

SECONDS_ARG=${1:-12}
JOBS=${2:-4}
FRAMES=$((SECONDS_ARG * 48000))

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

export SECONDS_ARG FRAMES work
run_one() {
  f=$1
  id=$(printf '%s' "$f" | md5sum | cut -c1-12)
  r="$work/r$id.wav"
  o="$work/o$id.wav"
  c="$work/c$id.txt"
  if ! /tmp/xmpref "$f" "$r" "$FRAMES" >/dev/null 2>&1; then
    echo "SKIP $f"
    return
  fi
  if ! node tools/render-ours.mjs "$f" "$o" "$SECONDS_ARG" >/dev/null 2>&1; then
    echo "RENDERFAIL $f"
    return
  fi
  if ! node tools/compare-wav.mjs "$r" "$o" 0 >"$c" 2>&1; then
    echo "DIFF $(basename "$f"): $(sed -n 2p "$c")"
  else
    echo "PASS $f"
  fi
}
export -f run_one

cat > "$work/list" || exit 1

xargs -P "$JOBS" -d '\n' -I{} bash -c 'run_one "$@"' _ {} < "$work/list" > "$work/out"

grep -c '^PASS' "$work/out" | sed 's/^/PASS=/'
grep '^DIFF\|^RENDERFAIL' "$work/out" >&2 || true
grep -c '^SKIP' "$work/out" | sed 's/^/SKIP=/'
echo "DIFF=$(grep -c '^DIFF\|^RENDERFAIL' "$work/out")"
