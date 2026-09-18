import { mkdtemp, cp, mkdir, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target || !path.isAbsolute(target) || !target.endsWith('.zip')) throw new Error('Provide an absolute output .zip path');
try { await stat(target); throw new Error('Output already exists; choose a new filename'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const staging = await mkdtemp(path.join(tmpdir(), 'pet-garden-package-'));
for (const entry of ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'server.mjs', 'server-runtime', 'starter', 'src', 'GARDEN-DEPLOY.md', 'scripts']) {
  await cp(entry, path.join(staging, entry), { recursive: true });
}
await mkdir(path.join(staging, 'dist'));
for (const entry of await readdir('dist')) {
  if (entry === 'othello') continue;
  await cp(path.join('dist', entry), path.join(staging, 'dist', entry), { recursive: true });
}
await mkdir(path.join(staging, 'public'));
for (const entry of ['audio', 'draco', 'hand-drawn-character']) {
  await cp(path.join('public', entry), path.join(staging, 'public', entry), { recursive: true });
}
execFileSync('zip', ['-q', '-r', target, '.'], { cwd: staging });
const entries = execFileSync('unzip', ['-Z1', target], { encoding: 'utf8' }).trim().split('\n');
if (entries.some((entry) => /(^|\/)(othello|games|node_modules|\.git|\.garden-data|\.env[^/]*)($|\/)/.test(entry))) throw new Error('Unexpected private or unrelated content in archive');
for (const required of ['index.html', 'dist/index.html', 'dist/audio/bgm/main.mp3', 'public/audio/bgm/main.mp3', 'server.mjs', 'server-runtime/home-items.js', 'starter/home.json', 'GARDEN-DEPLOY.md']) {
  if (!entries.includes(required)) throw new Error(`Missing ${required}`);
}
console.log(JSON.stringify({ zip: target, bytes: (await stat(target)).size, entries: entries.length, staging }, null, 2));
