---
'@modplayjs/core': minor
'@modplayjs/effects-shared': patch
'@modplayjs/fmt-it': patch
'@modplayjs/fmt-mod': patch
'@modplayjs/fmt-s3m': patch
'@modplayjs/fmt-xm': patch
---

The effects processor moved from `@modplayjs/effects-shared` into
`@modplayjs/core` (exported from the root), removing the core ↔
effects-shared dependency cycle. `@modplayjs/effects-shared` remains as a
compatibility shim that re-exports `@modplayjs/core`; the format plugins
now depend only on `@modplayjs/core`.
