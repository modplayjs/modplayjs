// ProWizard acceptance harness: depack via fmt-prowizard, parse via
// fmt-mod/modcore.loadDepackedMod, dump a compare_module-shaped summary
// for diffing against libxmp gen_module_data goldens.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = (await import('esbuild')).default;
const pkgs = ['core', 'effects-shared', 'fmt-mod', 'fmt-prowizard'];
const aliasMap = Object.fromEntries(pkgs.map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/pw-entry.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: resolve(repo, 'out/pw-test.mjs'), logLevel: 'silent',
});
const { depackModule } = await import('file://' + resolve(repo, 'out/pw-test.mjs'));
const [file] = process.argv.slice(2);
const out = depackModule(new Uint8Array(readFileSync(file)));
console.log(JSON.stringify(out));
