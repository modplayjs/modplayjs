#!/bin/bash
# tools/deep-parity-sweep.sh — deep loader parity: diff C libxmp ModuleData
# dumps against our loader dumps for EVERY file of the given extensions in
# the keygen pack.
# usage: tools/deep-parity-sweep.sh <ext> [<ext> ...]   (e.g. mod xm it s3m)
cd "$(dirname "$0")/.."
XMPDUMP=/tmp/xmpdump
[ -x "$XMPDUMP" ] || { echo "C dumper missing" >&2; exit 2; }
PASS=0; FAIL=0; SKIP=0
for ext in "$@"; do
  find "testfiles2/KEYGENMUSiC MusicPack" -iname "*.$ext" -print0 | while IFS= read -r -d '' f; do
    name=$(basename "$f")
    if ! "$XMPDUMP" "$f" > /tmp/dp-c.$$.txt 2>/dev/null; then
      echo "SKIP $name (C load fail)"; continue
    fi
    if ! node tools/xmpdump.mjs "$f" > /tmp/dp-js.$$.txt 2>/tmp/dp-js.$$.err; then
      echo "FAIL $name (our load error)"; head -2 /tmp/dp-js.$$.err | sed 's/^/     /'; continue
    fi
    if diff -q /tmp/dp-c.$$.txt /tmp/dp-js.$$.txt > /dev/null 2>&1; then
      echo "PASS $name"
    else
      n=$(diff /tmp/dp-c.$$.txt /tmp/dp-js.$$.txt | grep -c '^[<>]')
      echo "FAIL $name ($n diff lines)"; diff /tmp/dp-c.$$.txt /tmp/dp-js.$$.txt | head -6 | sed 's/^/     /'
    fi
  done
done
