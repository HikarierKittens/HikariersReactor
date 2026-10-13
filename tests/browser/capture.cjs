const fs = require('node:fs');
const { spawn } = require('node:child_process');

module.exports = async function capture(browser, profile, baseUrl, output) {
  const child = spawn(browser, ['--headless', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    const portFile = require('node:path').join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await new Promise(r => setTimeout(r, 100));
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(page => page.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id && pending.has(data.id)) { const { resolve, reject, timer } = pending.get(data.id); clearTimeout(timer); pending.delete(data.id); data.error ? reject(Error(JSON.stringify(data.error))) : resolve(data.result); } });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 20000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); });
    await call('Page.enable');
    const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    for (const scenario of ['fresh', 'advanced']) {
      for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: label === 'mobile' });
        await call('Page.navigate', { url: `${baseUrl}/tests/browser/visual.html?scenario=${scenario}` });
        let ready = false;
        for (let i = 0; i < 100; i++) {
          await new Promise(r => setTimeout(r, 100));
          ready = await evaluate(`location.pathname === '/' && !!document.querySelector('#app[data-v-app] .layout')`);
          if (ready) break;
        }
        if (!ready) throw Error('Screenshot root game failed to mount');
        await new Promise(r => setTimeout(r, 300));
        const metrics = await evaluate(`JSON.stringify({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,25)})`);
        const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = require('node:path').join(output, `${scenario}-${label}.png`);
        fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
        fs.writeFileSync(file.replace('.png', '.json'), metrics);
        console.log(`Screenshot: ${file}\nMetrics: ${metrics}`);
      }
    }
    await call('Browser.close');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('close', resolve)); }
  }
};
