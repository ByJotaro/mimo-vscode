import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(root, 'src/webview/app/main.ts')],
  bundle: true,
  outfile: path.join(root, 'media/app.js'),
  platform: 'browser',
  target: ['es2020'],
  format: 'iife',
  sourcemap: true,
  logLevel: 'info',
  // host/format is pure TS — fine to bundle into webview
});
console.log('webview bundle → media/app.js');
