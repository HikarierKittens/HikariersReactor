import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { stripEmoji } from '../src/shared/plain-text';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { addLog } from '../src/simulation/progression';
import { validateHistory } from '../src/state/validate-history';
import { parseInline, parseMarkdown } from '../src/vue/markdown';

test('game sources and shipped pages never introduce emoji decorations', () => {
  const forbidden = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3]/u;
  const scan = (directory: URL): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) scan(path);
      else {
        let source = readFileSync(path, 'utf8');
        // User-approved exception: only the four configuration entrance buttons.
        if (path.pathname.endsWith('/src/vue/components/BuildingsPanel.vue')) {
          const gears = source.match(/>\u2699<\/button>/g) || [];
          assert.equal(gears.length, 4, 'retain exactly the four approved gear entrances');
          source = source.replace(/>\u2699<\/button>/g, '></button>');
        }
        assert.equal(forbidden.test(source), false, path.pathname);
      }
    }
  };
  scan(new URL('../src/', import.meta.url));
  for (const path of ['../index.html', '../updatelog.html', '../updatelog.md', '../assets/css/style.css']) {
    assert.equal(forbidden.test(readFileSync(new URL(path, import.meta.url), 'utf8')), false, path);
  }
});

test('new logs and imported history strip legacy emoji without losing content', () => {
  const oldText = '\u{1F3C5} 成就达成：测试 \u{1F1E8}\u{1F1F3} 1\uFE0F\u20E3 \u{1F469}\u200D\u{1F4BB}';
  assert.equal(stripEmoji(oldText), '成就达成：测试');
  const state = createInitialState(CONFIG.version, 60, 0);
  addLog(state, oldText, 'achievement');
  assert.equal(state.logs[0]?.text, '成就达成：测试');
  const raw = { ...state, logs: [{ time: 1, type: 'achievement', text: oldText }] };
  const before = JSON.stringify(raw);
  validateHistory(raw, state);
  assert.equal(state.logs[0]?.text, '成就达成：测试');
  assert.equal(JSON.stringify(raw), before);
});

test('inline parser splits bold and code without producing HTML', () => {
  assert.deepEqual(parseInline('a **b** `c` <i>d</i>'), [
    { kind: 'text', text: 'a ' }, { kind: 'strong', text: 'b' }, { kind: 'text', text: ' ' },
    { kind: 'code', text: 'c' }, { kind: 'text', text: ' <i>d</i>' },
  ]);
});

test('block parser handles headings, nested lists, rules, quotes and paragraphs', () => {
  const blocks = parseMarkdown('# T\r\n> note\n\n## v1\n- a\n  - a1\n- b\n---\nline one\nline two\n');
  assert.deepEqual(blocks.map(block => block.kind), ['heading', 'quote', 'heading', 'list', 'rule', 'paragraph']);
  const list = blocks[3];
  assert.ok(list?.kind === 'list');
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0]!.children, [[{ kind: 'text', text: 'a1' }]]);
  const paragraph = blocks[5];
  assert.ok(paragraph?.kind === 'paragraph');
  assert.equal(paragraph.segments[0]!.text, 'line one line two');
});

test('game title matches the README, app header and both HTML entry pages', () => {
  const title = '喵星旅人_world.execution(cat);';
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.ok(source('../index.html').includes(`<title>${title}</title>`));
  assert.ok(source('../updatelog.html').includes(`<title>更新日志 · ${title}</title>`));
  assert.ok(source('../src/vue/App.vue').includes(`<b>${title}</b>`));
  assert.equal(source('../README.md').split(/\r?\n/)[0], `# ${title}`);
});

test('root updatelog.md exists and starts with a version heading', () => {
  const blocks = parseMarkdown(readFileSync(new URL('../updatelog.md', import.meta.url), 'utf8'));
  assert.ok(blocks.some(block => block.kind === 'heading' && block.level === 2));
});
