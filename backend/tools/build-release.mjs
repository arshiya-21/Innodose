// Builds a self-contained, source-free release folder:  backend/release/inodose-<version>/
//   npm run release        (from the backend folder)
// The output runs on Windows AND Linux (all dependencies are pure JavaScript); the target only needs Node 20+.
import { execSync } from 'node:child_process';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const frontend = path.resolve(backend, '..', 'frontend');
const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
const out = path.join(backend, 'release', `inodose-${pkg.version}`);
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log('1/5 building frontend…');
run('npm run build', frontend);
fs.cpSync(path.join(frontend, 'dist'), path.join(out, 'public'), { recursive: true });

console.log('2/5 bundling backend…');
await build({
  entryPoints: [path.join(backend, 'src', 'server.ts')],
  outfile: path.join(out, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', packages: 'external', sourcemap: false,
  // The app finds its migrations / public / tools folders next to this file.
  banner: { js: "import { fileURLToPath as __f } from 'node:url'; import __p from 'node:path'; process.env.INODOSE_HOME ??= __p.dirname(__f(import.meta.url)); process.env.PORT ??= '5173';" },
});

console.log('3/5 copying migrations + PLC tool…');
fs.cpSync(path.join(backend, 'migrations'), path.join(out, 'migrations'), { recursive: true });
fs.mkdirSync(path.join(out, 'tools'));
for (const f of ['plc_write.py', 'reset-admin.mjs']) fs.copyFileSync(path.join(backend, 'tools', f), path.join(out, 'tools', f));
fs.writeFileSync(path.join(out, 'tools', 'requirements.txt'), 'pycomm3\n');

console.log('4/5 installing production dependencies…');
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', dependencies: pkg.dependencies }, null, 2));
run('npm install --omit=dev --no-audit --no-fund', out);

console.log('5/5 adding config + service files…');
fs.copyFileSync(path.join(backend, '.env.example'), path.join(out, '.env.example'));
const deploy = path.join(backend, 'deploy');
if (fs.existsSync(deploy)) fs.cpSync(deploy, out, { recursive: true });
// One file to hand over: inodose-<version>.zip (Windows: Compress-Archive, Linux/macOS: zip).
const zip = out + '.zip';
fs.rmSync(zip, { force: true });
try {
  if (process.platform === 'win32') run(`powershell -NoProfile -Command "Compress-Archive -Path '${out}' -DestinationPath '${zip}'"`, backend);
  else run(`zip -qr '${zip}' '${path.basename(out)}'`, path.dirname(out));
} catch { console.log('(could not create the zip automatically — zip the folder by hand)'); }
console.log(`\nDone → ${out}\n      ${zip}\nSend the zip. It contains no source code (server.mjs is a compiled bundle).`);
