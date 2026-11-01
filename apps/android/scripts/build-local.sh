#!/usr/bin/env bash
# Local debug build using the pinned, prebuilt NativeScript V8 Android binary.
set -euo pipefail
cd "$(dirname "$0")/../../.."
npm ci
npm run build
npm run build:engine -w @modplayjs/android
./apps/android/scripts/fetch-v8-prebuilt.sh arm64-v8a build/v8-prebuilt
cd apps/android
./gradlew :app:assembleDebug -Pv8Dir="$PWD/../../build/v8-prebuilt/android-arm64-v8a"
