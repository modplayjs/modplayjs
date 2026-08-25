const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = '/root/git/modpayjs';

const packages = [
  { name: 'core',          deps: [] },
  { name: 'effects-shared', deps: ['core'] },
  { name: 'fmt-mod',        deps: ['core', 'effects-shared'] },
  { name: 'fmt-s3m',        deps: ['core', 'effects-shared'] },
  { name: 'fmt-xm',         deps: ['core', 'effects-shared'] },
  { name: 'fmt-it',         deps: ['core', 'effects-shared'] },
  { name: 'dsp-paula',      deps: ['core'] },
  { name: 'dsp-softmixer',  deps: ['core'] },
  { name: 'out-webaudio',   deps: ['core'] },
  { name: 'out-pcm',        deps: ['core'] },
];

for (const p of packages) {
  const dir = join(root, 'packages', p.name);
  mkdirSync(join(dir, 'src'), { recursive: true });

  const deps = {};
  for (const d of p.deps) deps[`@modplayjs/${d}`] = '*';

  const pkg = {
    name: `@modplayjs/${p.name}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    scripts: {
      build: 'tsc -p tsconfig.build.json',
    },
  };
  if (Object.keys(deps).length > 0) pkg.dependencies = deps;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    extends: '../../tsconfig.base.json',
    include: ['src/**/*.ts'],
  }, null, 2) + '\n');

  writeFileSync(join(dir, 'tsconfig.build.json'), JSON.stringify({
    extends: './tsconfig.json',
    compilerOptions: {
      noEmit: false,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: 'dist',
      composite: false,
    },
    include: ['src/**/*.ts'],
  }, null, 2) + '\n');

  const index = p.name === 'core'
    ? '// @modplayjs/core — public API (filled in by T2-T8)\nexport {};\n'
    : `// @modplayjs/${p.name} — public API stub\nexport {};\n`;
  writeFileSync(join(dir, 'src', 'index.ts'), index);
}

// demo skeleton
const demoDir = join(root, 'demo');
mkdirSync(join(demoDir, 'src'), { recursive: true });

writeFileSync(join(demoDir, 'package.json'), JSON.stringify({
  name: 'demo',
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  dependencies: {
    '@modplayjs/core': '*',
    '@modplayjs/effects-shared': '*',
    '@modplayjs/fmt-xm': '*',
    '@modplayjs/dsp-softmixer': '*',
    '@modplayjs/out-webaudio': '*',
    '@modplayjs/out-pcm': '*',
  },
  devDependencies: {
    vite: '^6.0.0',
  },
}, null, 2) + '\n');

writeFileSync(join(demoDir, 'tsconfig.json'), JSON.stringify({
  extends: '../tsconfig.base.json',
  compilerOptions: {
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  },
  include: ['src/**/*.ts', 'vite.config.ts'],
}, null, 2) + '\n');

writeFileSync(join(demoDir, 'vite.config.ts'),
`import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es',
  },
});
`);

writeFileSync(join(demoDir, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>modplayjs demo</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

writeFileSync(join(demoDir, 'src', 'main.ts'),
`// demo entry point (filled in by T22)
console.log('modplayjs demo');
`);

console.log('scaffold done');