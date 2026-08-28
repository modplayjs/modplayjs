// out-webaudio public API.
//
// NOTE: worklet.ts is NOT exported here. It defines
// `class ... extends AudioWorkletProcessor`, whose class declaration is
// evaluated at import time — pulling it into a main-thread bundle would
// throw at load (no worklet scope on the main thread). The demo/harness
// loads it as its own module via audioWorklet.addModule(workletUrl).

export { WebAudioOutput, createWebAudioOutput } from './webaudio.js';
