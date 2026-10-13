import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseInline, parseMarkdown } from '../src/vue/markdown';

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

test('root updatelog.md exists and starts with a version heading', () => {
  const blocks = parseMarkdown(readFileSync(new URL('../updatelog.md', import.meta.url), 'utf8'));
  assert.ok(blocks.some(block => block.kind === 'heading' && block.level === 2));
});
