// Acceptance harness: depack via fmt-prowizard, parse via fmt-mod core,
// dump via the same ModuleData shape xmpdump.mjs prints (for diffing vs
// the C gen_module_data golden format).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const repo = resolve(import.meta.dirname, '..');
const esbuild = (await import('esbuild')).default;
const pkgs = ['core','effects-shared','fmt-mod','fmt-prowizard'];
const aliasMap = Object.fromEntries(pkgs.map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
await esbuild.build({
  entryPoints: [resolve(repo, 'packages/fmt-prowizard/src/pw-entry.ts')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: resolve(repo, 'out/pw-test.mjs'), logLevel: 'silent',
});
const { depackModule } = await import('file://' + resolve(repo, 'out/pw-test.mjs'));
const [file, name] = process.argv.slice(2);
const out = depackModule(new Uint8Array(readFileSync(file)), name ?? 'prowizard');
console.log(JSON.stringify(out));
