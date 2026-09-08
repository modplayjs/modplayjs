#!/bin/sh
# tools/run-loader-parity.sh — full loader-parity sweep for IT/XM:
# for every .it/.xm in reference/libxmp/test-dev/data and testfiles,
# diff C libxmp's ModuleData dump against our loader's.
# usage: tools/run-loader-parity.sh [filter-substring]
cd "$(dirname "$0")/.."

XMPDUMP=/tmp/xmpdump
if [ ! -x "$XMPDUMP" ]; then
  echo "C dumper missing: build /tmp/xmpdump.c first" >&2
  exit 2
fi

PASS=0; FAIL=0; SKIP=0
FILTER=${1:-}
for f in reference/libxmp/test-dev/data/*.it reference/libxmp/test-dev/data/*.xm \
         testfiles/*.it testfiles/*.xm; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  case "$name" in *$FILTER*) ;; *) continue;; esac
  if ! "$XMPDUMP" "$f" > /tmp/lp-c.txt 2>/dev/null; then
    SKIP=$((SKIP+1)); echo "SKIP $name (C load fail)"; continue
  fi
  if ! node tools/xmpdump.mjs "$f" > /tmp/lp-js.txt 2>/tmp/lp-js.err; then
    FAIL=$((FAIL+1)); echo "FAIL $name (our load error)"; head -2 /tmp/lp-js.err | sed 's/^/     /'
    continue
  fi
  if diff -q /tmp/lp-c.txt /tmp/lp-js.txt > /dev/null 2>&1; then
    PASS=$((PASS+1)); echo "PASS $name ($(wc -l < /tmp/lp-c.txt) lines)"
  else
    FAIL=$((FAIL+1))
    n=$(diff /tmp/lp-c.txt /tmp/lp-js.txt | grep -c '^[<>]')
    echo "FAIL $name ($n diff lines)"; diff /tmp/lp-c.txt /tmp/lp-js.txt | head -6 | sed 's/^/     /'
  fi
done
echo "=== $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
