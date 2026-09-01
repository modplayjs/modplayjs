#!/bin/sh
# Build the reference libxmp static library for the parity harness.
# usage: tools/build-ref-libxmp.sh [output.a]
# Compiles the bundled reference/libxmp sources (C libxmp) into a static
# archive; requires a C compiler and the reference checkout.
set -e
OUT=${1:-/tmp/libxmp4.a}
SRC=$(dirname "$0")/../reference/libxmp
TMP=$(mktemp -d)
find "$SRC/src" -name '*.c' | while read -r f; do
  gcc -O2 -fPIC -c "$f" -I"$SRC" -I"$SRC/src" -I"$SRC/include" -I"$SRC/src/loaders" \
    -o "$TMP/$(echo "$f" | tr '/' '_').o" 2>/dev/null || echo "skipped $f" >&2
done
ar rcs "$OUT" "$TMP"/*.o
# drop lite duplicates (src/lite is a stripped second copy of the same symbols)
ar t "$OUT" | grep lite_ | while read o; do ar d "$OUT" "$o"; done
echo "built $OUT ($(ar t "$OUT" | wc -l) objects)"
