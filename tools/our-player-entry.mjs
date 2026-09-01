// Bundle entry for the parity harness: CorePlayer + all four format plugins +
// the softmixer + the WAV encoder, re-exported for tools/correlate.mjs.
export { CorePlayer } from '@modplayjs/core';
export { plugin as modPlugin } from '@modplayjs/fmt-mod';
export { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
export { plugin as xmPlugin } from '@modplayjs/fmt-xm';
export { plugin as itPlugin } from '@modplayjs/fmt-it';
export { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
export { encodeWavStereo } from '@modplayjs/out-pcm';
