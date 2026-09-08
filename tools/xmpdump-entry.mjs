// Bundle entry for the loader-parity dumper: CorePlayer + all four format plugins.
export { CorePlayer } from '@modplayjs/core';
export { plugin as modPlugin } from '@modplayjs/fmt-mod';
export { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
export { plugin as xmPlugin } from '@modplayjs/fmt-xm';
export { plugin as itPlugin } from '@modplayjs/fmt-it';
