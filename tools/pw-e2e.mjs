// End-to-end pwPlugin check: CorePlayer + fmt-mod + fmt-prowizard.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = (await import('esbuild')).default;
const pkgs = ['core', 'effects-shared', 'fmt-mod', 'fmt-prowizard'];
const aliasMap = Object.fromEntries(pkgs.map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/pw-e2e-entry.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: resolve(repo, 'out/pw-e2e.mjs'), logLevel: 'silent',
});
const { CorePlayer, modPlugin, pwPlugin } = await import('file://' + resolve(repo, 'out/pw-e2e.mjs'));
const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(pwPlugin);
const file = process.argv[2];
core.loadModule(new Uint8Array(readFileSync(file)));
console.log('pwPlugin e2e OK:', core.module.tracker, '| chn', core.module.chn, 'len', core.module.len, 'ins', core.module.ins);
