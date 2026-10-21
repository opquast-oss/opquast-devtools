// Fetch a Firefox and a geckodriver for the e2e run into ~/.cache/opquast-e2e (outside the repo),
// once. FIREFOX_BIN / GECKODRIVER_BIN point to existing ones instead.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE = join(homedir(), '.cache', 'opquast-e2e');
const GECKODRIVER = '0.36.0';

const arm = process.arch === 'arm64';
const FIREFOX_URL = `https://download.mozilla.org/?product=firefox-latest-ssl&os=${
  arm ? 'linux64-aarch64' : 'linux64'
}&lang=fr`;
const GECKO_URL = `https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER}/geckodriver-v${GECKODRIVER}-${
  arm ? 'linux-aarch64' : 'linux64'
}.tar.gz`;

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function untar(file) {
  try {
    execFileSync('tar', ['-xf', file, '-C', CACHE], { stdio: 'pipe' });
  } catch {
    // No xz on the system: Python's tarfile reads .tar.xz on its own.
    execFileSync('python3', [
      '-c',
      'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2], filter="tar")',
      file,
      CACHE,
    ]);
  }
  rmSync(file);
}

export async function getFirefox() {
  if (process.platform !== 'linux' && !(process.env.FIREFOX_BIN && process.env.GECKODRIVER_BIN)) {
    throw new Error('automatic download is Linux-only: set FIREFOX_BIN and GECKODRIVER_BIN');
  }
  mkdirSync(CACHE, { recursive: true });
  const firefox = process.env.FIREFOX_BIN ?? join(CACHE, 'firefox', 'firefox');
  const geckodriver = process.env.GECKODRIVER_BIN ?? join(CACHE, 'geckodriver');
  if (!existsSync(firefox)) {
    console.log(`[e2e] downloading Firefox (${process.arch}) → ${CACHE}`);
    await download(FIREFOX_URL, join(CACHE, 'firefox.tar.xz'));
    untar(join(CACHE, 'firefox.tar.xz'));
  }
  if (!existsSync(geckodriver)) {
    console.log(`[e2e] downloading geckodriver ${GECKODRIVER} → ${CACHE}`);
    await download(GECKO_URL, join(CACHE, 'geckodriver.tar.gz'));
    untar(join(CACHE, 'geckodriver.tar.gz'));
  }
  return { firefox, geckodriver };
}
