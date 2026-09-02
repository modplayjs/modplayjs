#!/bin/sh
# Run compare-mixer-data.mjs over every libxmp golden mixer-data fixture.
# usage: tools/run-mixer-data-tests.sh [filter-substring]
cd "$(dirname "$0")/.."
DATA=reference/libxmp/test-dev/data
PASS=0; FAIL=0; SKIP=0
FILTER=${1:-}
for it in "$DATA"/*.it "$DATA"/*.xm "$DATA"/*.mod "$DATA"/*.s3m; do
  [ -f "$it" ] || continue
  name=$(basename "$it")
  data="${it%.*}.data"
  [ -f "$data" ] || { SKIP=$((SKIP+1)); continue; }
  # Skip raw-mixer-sample dumps (one int per line) and single-line tests:
  # they are state-less (compare_mixer_samples format, not state lines).
  if [ "$(head -n 1 "$data" | wc -w)" -lt 4 ]; then SKIP=$((SKIP+1)); continue; fi
  case "$name" in *$FILTER*) ;; *) continue;; esac
  if node tools/compare-mixer-data.mjs "$it" "$data" 3 > /tmp/md-last.txt 2>&1; then
    PASS=$((PASS+1)); echo "PASS $name  $(grep -m1 'STATE MATCH\|MISMATCHES' /tmp/md-last.txt)"
  elif grep -q '^SKIP' /tmp/md-last.txt; then
    SKIP=$((SKIP+1)); echo "SKIP $name  $(grep -m1 '^SKIP' /tmp/md-last.txt)"
  else
    FAIL=$((FAIL+1)); echo "FAIL $name"; grep -m3 '^row\|de-sync' /tmp/md-last.txt | sed 's/^/     /'
  fi
done
echo "=== $PASS passed, $FAIL failed, $SKIP without .data"
[ "$FAIL" -eq 0 ]
