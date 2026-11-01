#!/usr/bin/env bash
# Fetch the pinned NativeScript V8 Android static library + headers.
# No depot_tools, no Chromium checkout, no local V8 compile.
set -euo pipefail
V8_VERSION="14.9.207.39"
TAG="v8-${V8_VERSION}-7"
BASE="https://github.com/NativeScript/v8-buildscripts/releases/download/${TAG}"
ABI="${1:-arm64-v8a}"
OUT="${2:-build/v8-prebuilt}"
mkdir -p "$OUT"
cd "$OUT"
if [ ! -d "android-${ABI}" ]; then
  curl -sSLo "v8-${V8_VERSION}-android-${ABI}.tar.gz" "$BASE/v8-${V8_VERSION}-android-${ABI}.tar.gz"
  curl -sSLo SHA256SUMS "$BASE/SHA256SUMS"
  grep "v8-${V8_VERSION}-android-${ABI}.tar.gz" SHA256SUMS | sha256sum -c -
  tar -xzf "v8-${V8_VERSION}-android-${ABI}.tar.gz"
  mv "android-${ABI}" "v8-${ABI}"
  ln -sfn "v8-${ABI}" "android-${ABI}"
fi
echo "$PWD/android-${ABI}"
