// Bundles the Vercel serverless entry into a single CommonJS file (api/index.js).
// Vercel would otherwise compile api/*.ts itself using the Angular tsconfig, which emits ES modules
// that Node refuses to load (no "type": "module" in package.json).
import { build } from 'esbuild';

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // The libSQL client ships native binaries, so it must stay a regular node_modules dependency.
  external: ['@libsql/client', 'libsql'],
  footer: { js: 'module.exports = module.exports.default;' },
  legalComments: 'none',
  logLevel: 'info',
});
