/**
 * Host half: ESM bundle, runtime dependencies resolved from the profile.
 * Client half: classic script registered on window.__ModuleLoader__.
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

/** Frozen browser module table. Keep in sync with the shell. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  minify: true,
  legalComments: 'linked',
  target: 'es2020',
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-synthesizer', factory: (require) => {var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
  sourcemap: true,
  logLevel: 'info',
})

console.log('dsh-synthesizer: built host (lib/index.js) + client (lib/client.js)')
