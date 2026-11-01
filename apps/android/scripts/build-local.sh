#!/usr/bin/env bash
# Local debug build using the pinned, prebuilt NativeScript V8 Android binary.
set -euo pipefail
cd "$(dirname "$0")/../../.."
npm ci
npm run build
npm run build:engine -w @modplayjs/android
V8_DIR=$(node apps/android/scripts/fetch-v8.mjs arm64-v8a)
cd apps/android
./gradlew :app:assembleDebug -Pv8Dir="$V8_DIR"
