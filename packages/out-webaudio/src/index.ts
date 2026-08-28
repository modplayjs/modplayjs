// out-webaudio public API: OutputPlugin + the worklet module source.

export { WebAudioOutput, createWebAudioOutput } from './webaudio.js';
export { ModPlayProcessor, ChunkFifo } from './worklet.js';
export type { WorkletProcessorBase } from './worklet.js';
