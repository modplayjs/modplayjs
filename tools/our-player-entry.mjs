// Bundle entry for the parity harness: CorePlayer + all four format plugins +
// the softmixer + the WAV encoder, re-exported for tools/correlate.mjs.
export { CorePlayer } from '@modplayjs/core';
export { plugin as modPlugin, hmnPlugin, fltPlugin } from '@modplayjs/fmt-mod';
export { pwPlugin } from '@modplayjs/fmt-prowizard';
export { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
export { plugin as xmPlugin } from '@modplayjs/fmt-xm';
export { plugin as itPlugin } from '@modplayjs/fmt-it';
export { plugin as stPlugin } from '@modplayjs/fmt-st';
export { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
export { encodeWavStereo } from '@modplayjs/out-pcm';
export { plugin as mo3Plugin } from '@modplayjs/fmt-mo3';
export { plugin as fcPlugin, fcEffect } from '@modplayjs/fmt-fc';
