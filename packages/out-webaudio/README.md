# @modplayjs/out-webaudio

**AudioWorklet output** for `@modplayjs/core` — hardware-paced playback in
the browser.

## Install

```sh
npm install @modplayjs/out-webaudio
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { WebAudioOutput } from '@modplayjs/out-webaudio';
// The worklet ships as source — hand it to the output as a bundled URL.
// Vite example (bundles the processor as a hashed ES module):
import workletUrl from './src/worklet.ts?worker&url';

const core = new CorePlayer();
core.setSampleRate(48000);
core.startPlayer();

const output = new WebAudioOutput();
await output.start(core, workletUrl);   // call from a user gesture

output.pause();
await output.resume();                  // resume needs a gesture again
output.stop();
```

`start()` requires a `workletUrl` because `AudioWorkletProcessor` code
must be served as its own ES module; the package cannot know your
bundler's URL scheme. See the demo (`apps/demo/src/worklet-url-impl.ts`)
for the complete Vite wiring, including the COOP/COEP shim.

### Two transports, chosen automatically

- **SAB ring** (default when `SharedArrayBuffer` + `crossOriginIsolated`):
  a render-ahead ring with hardware-paced backpressure via an
  `AudioWorkletProcessor` — steady latency, no main-thread audio jitter.
- **Copy-mode fallback**: chunked FIFO posting when SAB is unavailable.

Needs COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`) for the SAB path. On static
hosts like GitHub Pages the demo bundles the
[`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker)
shim; the worklet is emitted as an ES module (`worker.format: 'es'` in
Vite) so `audioWorklet.addModule` can fetch it.

Also exports `createWebAudioOutput()` for a factory-style API.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
