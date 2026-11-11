import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
const patterns = [/\bK\d{15,22}\b/, /\b(?:nfp_|gh[pousr]_)[A-Za-z0-9]{30,}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const matches = [];
function inspect(name, bytes) {
  if (name.endsWith('.gz')) { try { bytes = gunzipSync(bytes); } catch { return; } }
  const text = bytes.toString('utf8');
  if (patterns.some(pattern => pattern.test(text))) matches.push(name);
}
const files = execFileSync('git', ['-c', 'safe.directory=D:/MLibrary', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) if (statSync(file).isFile()) {
  if (/(?:^|\/)\.private\//.test(file) || /\.(?:p12|jks|keystore)$/.test(file)) matches.push(file);
  inspect(file, readFileSync(file));
}
let builtFiles = 0;
function scan(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = `${directory}/${entry.name}`; if (entry.isDirectory()) scan(path); else { builtFiles++; inspect(path, readFileSync(path)); } } }
if (existsSync('dist')) scan('dist');
const packages = [];
for (const path of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  let entries = 0;
  for (const [name, file] of Object.entries(zip.files)) if (!file.dir) { inspect(`${path}:${name}`, await file.async('nodebuffer')); entries++; }
  const corpus = Object.keys(zip.files).filter(n => /assets\/public\/data\/gallica\//.test(n));
  if (corpus.length) throw new Error('The Android package unexpectedly includes the Gallica corpus');
  packages.push({ path, entries, nativeLibraries: Object.keys(zip.files).filter(n => n.endsWith('.so')).length });
}
console.log(JSON.stringify({ repositoryFiles: files.length, builtFiles, packages, credentialMatches: matches }));
if (matches.length) process.exitCode = 1;
