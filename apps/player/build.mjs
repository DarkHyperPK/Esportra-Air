// Bundles the main process and preload for ow-electron (CommonJS, Node platform).
import { build } from 'esbuild';

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: true, external: ['electron'], logLevel: 'info' };
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs' });
await build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload.cjs' });
