// Load the ordered bridge scripts plus the retained classic globals into a VM context.
// The browser entry is the Vue app, so the script list comes from the generator manifest.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/generated/manifest.json'), 'utf8'));
const scripts = [
  ...manifest.map(name => `assets/generated/${name}.js`),
  'tests/support/legacy-globals.js',
];

function loadGame(ctx) {
  for (const file of scripts) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(text, ctx, { filename: file });
  }
}

const source = scripts.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
module.exports = { loadGame, scripts, source };
