#!/bin/bash
# tools/run-xm-parity.sh — full loader-parity sweep for XM:
# for every .xm in reference/libxmp/test-dev/data (incl. f/ and m/),
# reference/libxmp/test-dev/testfiles, and testfiles/, diff C libxmp's
# ModuleData dump against our loader's.
# usage: tools/run-xm-parity.sh [fresh|stale]  (default: rebuild C dumper)
cd "$(dirname "$0")/.."

set -e
# Rebuild the C dumper from the pristine reference checkout so the diff
# is against THIS tree's sources, not a stale binary.
tools/build-ref-libxmp.sh /tmp/libxmp4-xm.a > /dev/null
cc -O2 -o /tmp/xmpdump-xm tools/xmpdump.c -I reference/libxmp/include -I reference/libxmp/src /tmp/libxmp4-xm.a -lm

PASS=0; FAIL=0; SKIP=0
FAILED=()
for f in reference/libxmp/test-dev/data/*.xm \
         reference/libxmp/test-dev/data/f/*.xm \
         reference/libxmp/test-dev/data/m/*.xm \
         reference/libxmp/test-dev/testfiles/*.xm \
         testfiles/*.xm; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  if ! /tmp/xmpdump-xm "$f" > /tmp/xmp-c.txt 2>/dev/null; then
    SKIP=$((SKIP+1)); echo "SKIP $name (C load fail)"; continue
  fi
  if ! node tools/xmpdump.mjs "$f" > /tmp/xmp-js.txt 2>/tmp/xmp-js.err; then
    FAIL=$((FAIL+1)); FAILED+=(""$name"")
    echo "FAIL $name (our load error)"; head -2 /tmp/xmp-js.err | sed 's/^/     /'
    continue
  fi
  if diff -q /tmp/xmp-c.txt /tmp/xmp-js.txt > /dev/null 2>&1; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1)); FAILED+=(""$name"")
    n=$(diff /tmp/xmp-c.txt /tmp/xmp-js.txt | grep -c '^[<>]')
    echo "FAIL $name ($n diff lines)"
    diff /tmp/xmp-c.txt /tmp/xmp-js.txt | head -8 | sed 's/^/     /'
  fi
done
echo "=== XM loader parity: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
