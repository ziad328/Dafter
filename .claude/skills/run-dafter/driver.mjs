#!/usr/bin/env node
// Drive a running Dafter dev stack (pnpm dev): API checks + a real browser via playwright-core.
// Usage (from the repo root):
//   node .claude/skills/run-dafter/driver.mjs status
//   node .claude/skills/run-dafter/driver.mjs smoke
//   node .claude/skills/run-dafter/driver.mjs shot [route] [--locale ar|en] [--width 375] [--out file.png]
//     route has no leading slash ("app/groups"); Git Bash rewrites "/..." into a Windows path.
//   node .claude/skills/run-dafter/driver.mjs stop
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const SHOTS = resolve(process.env.DAFTER_SHOTS ?? '.shots');
const LOCALE_KEY = 'dafter.locale'; // apps/web/src/i18n.ts

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));

let failures = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: String(err.cause?.code ?? err.message) };
  }
}

async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  // Prefer an installed Chrome/Edge so no browser download is needed; fall back to Playwright's own.
  const channels = process.env.DAFTER_BROWSER ? [process.env.DAFTER_BROWSER] : ['chrome', 'msedge', undefined];
  let lastErr;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel: channel === 'chromium' ? undefined : channel, args: ['--no-sandbox'] });
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`No browser found. Install Chrome, or run: pnpm exec playwright-core install chromium\n${lastErr}`);
}

/** A phone-sized page with the locale preset and console errors collected. */
async function openPage(browser, { locale, width = 375 }) {
  const context = await browser.newContext({ viewport: { width: Number(width), height: 812 } });
  await context.addInitScript(
    ([key, value]) => {
      if (value && !sessionStorage.getItem('driver-init')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('driver-init', '1');
      }
    },
    [LOCALE_KEY, locale ?? null],
  );
  const page = await context.newPage();
  const errors = [];
  // "Failed to load resource" console lines carry no URL; record failed responses instead.
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, errors };
}

const docInfo = (page) =>
  page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    status: document.querySelector('[role=status]')?.textContent ?? '',
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));

async function status() {
  const api = await get(`${API}/health`);
  const web = await get(WEB);
  console.log(`api ${API}/health -> ${api.status || api.body}`);
  console.log(`web ${WEB} -> ${web.status || web.body}`);
  if (api.status !== 200 || web.status !== 200) {
    console.log('Not running. Start it with: pnpm dev (Docker Desktop must be running).');
    process.exitCode = 1;
  }
}

async function smoke() {
  console.log('API');
  const health = await get(`${API}/health`);
  check(health.status === 200 && health.body === '{"status":"ok"}', `GET /health -> ${health.status} ${health.body}`);
  const proxied = await get(`${WEB}/health`);
  check(proxied.status === 200, `Vite proxy /health -> ${proxied.status}`);
  const missing = await get(`${WEB}/api/v1/does-not-exist`);
  check(
    missing.status === 404 && missing.body === '{"code":"NOT_FOUND"}',
    `unknown route -> ${missing.status} ${missing.body} (error code, not a sentence)`,
  );
  if (health.status !== 200) return console.log('API is down; is pnpm dev running?');

  console.log('Web (375 px)');
  mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  try {
    const { page, errors } = await openPage(browser, { locale: 'ar' });
    await page.goto(WEB);
    await page.getByRole('status').filter({ hasText: 'الخادم متصل' }).waitFor({ timeout: 15000 });
    let info = await docInfo(page);
    check(info.lang === 'ar' && info.dir === 'rtl', `Arabic is RTL (lang=${info.lang} dir=${info.dir})`);
    check(!info.overflowX, 'no horizontal scroll');
    await page.screenshot({ path: join(SHOTS, 'smoke-ar.png') });

    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('status').filter({ hasText: 'Server connected' }).waitFor({ timeout: 5000 });
    await page.reload();
    await page.getByRole('status').filter({ hasText: 'Server connected' }).waitFor({ timeout: 15000 });
    info = await docInfo(page);
    check(info.lang === 'en' && info.dir === 'ltr', `switch to English persists after reload (dir=${info.dir})`);
    await page.screenshot({ path: join(SHOTS, 'smoke-en.png') });

    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    console.log(`Screenshots: ${join(SHOTS, 'smoke-ar.png')}, ${join(SHOTS, 'smoke-en.png')}`);
  } finally {
    await browser.close();
  }
}

async function shot() {
  const path = (positional[0] ?? '').replace(/^\/+/, '');
  // Git Bash rewrites a leading "/" argument into "C:/Program Files/Git/...".
  if (/^[A-Za-z]:[\\/]/.test(path))
    throw new Error(`Got a Windows path (${path}). Pass routes without a leading slash, e.g. "app/groups".`);
  const locale = flag('locale', 'ar');
  const out = resolve(flag('out', join(SHOTS, `shot-${locale}.png`)));
  mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser();
  try {
    const { page, errors } = await openPage(browser, { locale, width: flag('width', 375) });
    await page.goto(new URL(path, `${WEB}/`).href, { waitUntil: 'networkidle' });
    await page.locator('#root > *').first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: out, fullPage: true });
    console.log(JSON.stringify({ ...(await docInfo(page)), screenshot: out, consoleErrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
}

/** Kill whatever listens on the dev ports (pnpm/turbo do not forward signals to children). */
function stop() {
  for (const port of [3000, 5173]) {
    let pids = [];
    if (process.platform === 'win32') {
      // No -p filter: Vite listens on IPv6 [::1]:5173, which `-p tcp` (IPv4 only) misses.
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      pids = out
        .split('\n')
        .filter((l) => l.includes('LISTENING') && new RegExp(`:${port}\\s`).test(l))
        .map((l) => l.trim().split(/\s+/).pop());
    } else {
      pids = execSync(`lsof -ti:${port} -sTCP:LISTEN || true`, { encoding: 'utf8' }).split('\n');
    }
    for (const pid of new Set(pids.filter((p) => p && p !== '0'))) {
      execSync(process.platform === 'win32' ? `taskkill /PID ${pid} /T /F` : `kill ${pid}`, { stdio: 'ignore' });
      console.log(`stopped pid ${pid} on :${port}`);
    }
  }
  console.log('Postgres keeps running in Docker; stop it with: docker compose -f infra/docker-compose.yml stop');
}

const commands = { status, smoke, shot, stop };
if (!commands[cmd]) {
  console.log('commands: status | smoke | shot [route] [--locale ar|en] [--width 375] [--out file] | stop');
  process.exit(cmd === 'help' ? 0 : 1);
}
await commands[cmd]();
if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exitCode = 1;
}
