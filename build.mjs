import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const bundled = await build({ entryPoints: ['widget.js'], bundle: true, write: false, format: 'iife', platform: 'browser', target: ['chrome120'], minify: true });
// Replacement text can contain $&, $` or $' inside bundled dependencies.
// A function prevents String.replace from expanding those sequences.
const html = (await readFile('widget.html', 'utf8')).replace('<!-- APP_SCRIPT -->', () => `<script>${bundled.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/widget.html', html);
console.log(`Built widget: ${Buffer.byteLength(html)} bytes`);
