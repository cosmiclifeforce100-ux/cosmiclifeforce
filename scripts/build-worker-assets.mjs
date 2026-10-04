import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, '.worker-assets');
const publicAssets = path.join(root, 'public', 'assets');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(publicAssets, path.join(output, 'assets'), { recursive: true });

console.log('Worker assets staged in .worker-assets/.');
