// Make the e2e copy of a built extension: .output/<target> → test/e2e/.build/<target>, with
// devtools-stub.js loaded by panel.html ahead of the panel module. The shipped build is untouched.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

export function prepare(target) {
  const src = join(ROOT, '.output', target);
  if (!existsSync(join(src, 'manifest.json'))) {
    throw new Error(`${src} is missing: run \`npm run build\` / \`npm run build:firefox\` first`);
  }
  const out = join(HERE, '.build', target);
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });
  cpSync(join(HERE, 'devtools-stub.js'), join(out, 'devtools-stub.js'));

  const panel = join(out, 'panel.html');
  const html = readFileSync(panel, 'utf8');
  const at = html.indexOf('<script type="module"');
  if (at < 0) throw new Error('panel.html: no module script to put the DevTools stub in front of');
  writeFileSync(
    panel,
    `${html.slice(0, at)}<script src="/devtools-stub.js"></script>\n    ${html.slice(at)}`,
  );

  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  return { dir: out, manifest };
}
