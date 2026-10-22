// Headless-browser acceptance: boots the real Vite dev server, drives the Vue UI, asserts RESULT: PASS.
// Usage: node tests/run-browser.cjs   (skips with a clear message if no browser is found)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.ACCEPTANCE_PORT || 4399);
const PAGE = process.env.ACCEPTANCE_PAGE || 'tests/browser/acceptance.html';
// Full progression acceptance plus every building's two-width layout audit.
const BUDGET_MS = Number(process.env.ACCEPTANCE_BUDGET || 45000);

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!browser) {
  console.log('Browser acceptance skipped: no Edge/Chrome executable found (set BROWSER_PATH to enable).');
  process.exit(0);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hikariers-browser-'));
  const resolvedProfile = path.resolve(profile);
  if (path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) || !path.basename(resolvedProfile).startsWith('hikariers-browser-')) {
    throw new Error(`Unexpected browser profile path: ${resolvedProfile}`);
  }
  // Resolve the Vite CLI directly so no shell is needed to launch it.
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: 'ignore',
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    // Wait for the dev server to answer before launching the browser.
    for (let i = 0; i < 60; i++) {
      await wait(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/${PAGE}`);
        if (res.ok) break;
      } catch { /* not listening yet */ }
      if (i === 59) throw new Error(`dev server did not start on port ${PORT}`);
    }

    const dom = await new Promise((resolve, reject) => {
      // ACCEPTANCE_WINDOW="1440,900" widens the viewport so wide-screen-only layout rules
      // (e.g. the pinned right column) can be asserted; unset keeps the historical default.
      const windowArg = process.env.ACCEPTANCE_WINDOW ? [`--window-size=${process.env.ACCEPTANCE_WINDOW}`] : [];
      const child = spawn(browser, [
        '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
        ...windowArg,
        // Keep the console: a failing case is otherwise a black box (the dumped DOM only shows
        // the last rendered line). These lines are surfaced only when the run fails.
        '--enable-logging=stderr', '--log-level=0',
        `--user-data-dir=${resolvedProfile}`, '--no-first-run', '--no-default-browser-check',
        `--virtual-time-budget=${BUDGET_MS}`, '--dump-dom', `http://127.0.0.1:${PORT}/${PAGE}`,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      const deadline = setTimeout(() => { child.kill(); reject(new Error('browser timed out after 60 seconds')); }, 60000);
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', error => { clearTimeout(deadline); reject(error); });
      child.on('close', code => {
        clearTimeout(deadline);
        if (code !== 0) reject(new Error(`browser exited with code ${code}`));
        else resolve({ dom: out, err });
      });
    });

    // Browser noise (extension registries, China-market bundle probes, GPU chatter) is dropped so
    // the diagnosis below contains only signals from this page.
    const NOISE = /external_registry_loader|edge_china_browsers|QQBrowser|ChromeExtensionCache|ProtocolLaunch|\bGCM\b|DEPRECATED_ENDPOINT|registration_request|GetVSyncParametersIfAvailable|SharedImageManager|font_service/i;
    const consoleLines = dom.err.split('\n')
      .filter(line => /CONSOLE|Uncaught|SyntaxError|ReferenceError|TypeError|ERROR:/.test(line) && !NOISE.test(line))
      .map(line => line.trim())
      .slice(-25);
    const reportConsole = () => {
      if (!consoleLines.length) return;
      console.error('\n--- browser console (last 25 signals) ---');
      for (const line of consoleLines) console.error(line);
      console.error('--- end browser console ---');
    };
    const domText = dom.dom;

    const match = domText.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    if (!match) {
      console.error('Browser acceptance FAILED: no result element in the dumped DOM.');
      reportConsole();
      process.exitCode = 1;
      return;
    }
    const report = match[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    console.log(report);

    if (!/RESULT: PASS/.test(report)) {
      // The page paints its own reason when it can (see the classic error hook in the HTML);
      // the console lines cover the cases where it cannot.
      reportConsole();
      console.error('Browser acceptance FAILED.');
      process.exitCode = 1;
      return;
    }
    console.log(`\nBrowser acceptance passed in ${path.basename(browser)}.`);
    if (process.argv.includes('--screenshots')) {
      const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hikariers-screenshots-'));
      await require('./browser/capture.cjs')(browser, resolvedProfile, `http://127.0.0.1:${PORT}`, output);
    }
  } catch (error) {
    console.error(`Browser acceptance could not run: ${error.message}`);
    process.exitCode = 1;
  } finally {
    stop();
    // Delete only the exact temporary profile created and checked above.
    if (path.resolve(profile) !== resolvedProfile || path.dirname(resolvedProfile) !== path.resolve(os.tmpdir())) {
      throw new Error('Refusing to remove unexpected browser profile path');
    }
    fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

main();
