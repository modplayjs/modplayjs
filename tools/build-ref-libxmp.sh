#!/bin/sh
# Build the reference libxmp static library for the parity harness.
# usage: tools/build-ref-libxmp.sh [output.a]
# Compiles the bundled reference/libxmp sources (C libxmp) into a static
# archive; requires a C compiler and the reference checkout.
set -e
OUT=${1:-/tmp/libxmp4.a}
SRC=$(dirname "$0")/../reference/libxmp
TMP=$(mktemp -d)
# -ffp-contract=off: GCC defaults to -ffp-contract=fast, which fuses
# `vi->pos += step_dir * samples` (mixer.c:703) into a single FMA on
# targets that have one (aarch64, or x86-64 with -mfma) and so rounds
# once instead of twice. The fused and unfused results differ by 1 ulp,
# which is visible in the output PCM at interpolation boundaries. libxmp
# itself is not bit-reproducible across architectures because of this, so
# the oracle is pinned to the unfused evaluation of the C source
# expression (what x86-64 SSE2 builds produce) to keep the comparison
# architecture-independent.
find "$SRC/src" -name '*.c' | while read -r f; do
  gcc -O2 -ffp-contract=off -fPIC -c "$f" -I"$SRC" -I"$SRC/src" -I"$SRC/include" -I"$SRC/src/loaders" \
    -o "$TMP/$(echo "$f" | tr '/' '_').o" 2>/dev/null || echo "skipped $f" >&2
done
ar rcs "$OUT" "$TMP"/*.o
# drop lite duplicates (src/lite is a stripped second copy of the same symbols)
ar t "$OUT" | grep lite_ | while read o; do ar d "$OUT" "$o"; done
echo "built $OUT ($(ar t "$OUT" | wc -l) objects)"
