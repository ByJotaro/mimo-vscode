/**
 * Compile pure host modules to JS (no vscode) for node --test.
 * Uses esbuild bundle of format + db + session only.
 */
import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out-test');
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: {
    format: path.join(root, 'src/host/format/index.ts'),
    db: path.join(root, 'src/host/db/index.ts'),
    merge: path.join(root, 'src/host/session/merge.ts'),
  },
  bundle: true,
  outdir: outDir,
  platform: 'node',
  target: ['node18'],
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
});
console.log('test bundles → out-test/');
