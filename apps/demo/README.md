# @modplayjs/demo — the playground

The player behind <https://playground.modplayjs.org>, built with Svelte 5 on
Vite. The same bundle also serves a placeholder studio page and a 404 page.

```
index.html           player shell (mounts src/App.svelte)
studio/index.html    "coming soon" page
404.html             served by Workers for unknown paths
src/lib/engine.ts    CorePlayer, format/DSP registration, output, playhead
src/lib/player.svelte.ts   transport, loading, panels, playlist — no DOM
src/components/       one component per panel
```

The engine glue never touches the DOM; components read `player` state and
call its methods. The pattern grid is the exception: `PatternView.svelte`
builds the row DOM once per pattern and toggles classes per frame, because
sixty full re-renders a second would be worse than sixty class writes.

## Development

```sh
npm run dev        # http://localhost:5173, COOP/COEP headers included
npm run build      # -> dist/
npm run typecheck  # svelte-check
```

## Deploy

Workers static assets, no Worker script:

```sh
npm run deploy                        # build + wrangler deploy
npx wrangler deploy --dry-run         # upload check, no deploy
npx wrangler dev                      # serve dist/ locally, _headers applied
```

`wrangler.jsonc` attaches the Worker to `playground.modplayjs.org` as a
custom domain; the first deploy creates the DNS record and certificate. The
build writes root-absolute asset paths, so the site must be served from `/`,
not from a subdirectory.

`public/_headers` sets the cross-origin isolation headers at the edge, so
`SharedArrayBuffer` works on the first visit. The service worker still adds
them as a fallback and handles the PWA precache.

For Cloudflare's Git integration (Workers Builds), use the repository root as
the root directory, `npm ci && npm run build --workspace @modplayjs/demo` as
the build command and `npx wrangler deploy --config apps/demo/wrangler.jsonc`
as the deploy command.
