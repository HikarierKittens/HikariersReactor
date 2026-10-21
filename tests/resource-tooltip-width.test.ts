import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * 资源明细弹窗（知识收支 / 木材收支 …）的宽度策略。
 *
 * 玩家两次反馈同一个问题：
 * 1. 右列「消耗」里的长数值（例如「−9430.05/s」）放不下时被折成两行。
 * 2. 修完之后弹窗右侧出现一大块空白——`min-width:400px` 把容器撑宽，而内容只有
 *    175~250px，剩下的空间就空在那里。
 *
 * 最终策略：弹窗宽度 = 两列内容之和（`width:max-content`），不设 min-width。
 * 这些断言锁的是「不变量」，真实渲染结果由 `tests/browser/acceptance.html` 覆盖。
 */

const css = readFileSync(new URL('../assets/css/style.css', import.meta.url), 'utf8');

/** Extract one rule body by exact selector, ignoring longer selectors that start the same way. */
function ruleBody(selector: string): string | null {
  const needle = `${selector}{`;
  let from = 0;
  for (;;) {
    const start = css.indexOf(needle, from);
    if (start < 0) return null;
    // Reject a match that is the tail of a longer selector (e.g. `.resource-factor` inside
    // `.resource-detail .resource-factor`): the selector must start at a rule boundary.
    const before = start === 0 ? '' : css[start - 1];
    if (before === '' || before === '\n' || before === '}' || before === ';') {
      const end = css.indexOf('}', start);
      return end < 0 ? null : css.slice(start + needle.length, end);
    }
    from = start + 1;
  }
}

test('资源明细弹窗宽度由内容决定，不用 min-width 撑出空白', () => {
  const body = ruleBody('.building-tooltip.resource-detail');
  assert.ok(body, '资源明细弹窗规则必须存在');
  assert.match(body!, /width:max-content/, '宽度必须由内容决定');
  // 固定宽度是长数值被迫换行的根因。
  assert.doesNotMatch(body!, /(^|;)width:400px/, '不能再写死 400px');
  // min-width 会把弹窗撑宽到超过内容，右侧留下空白——这正是玩家第二次反馈的问题。
  assert.doesNotMatch(body!, /min-width/, '不能设 min-width：它会在内容少时撑出空白');
  // 变宽不能突破视口，否则右侧内容会被裁掉。
  assert.match(body!, /max-width:calc\(100vw - 16px\)/, '必须受视口宽度约束');
});

test('资源明细的两列都按内容取宽，不把剩余空间留在列内', () => {
  const columns = ruleBody('.resource-detail .resource-columns');
  assert.ok(columns, '两列容器规则必须限定在资源明细内');
  // grid 的 `minmax(0, …)` 会让列可以收缩到 0，长数值仍然换行。
  assert.doesNotMatch(columns!, /minmax\(0,/, '列不能用 minmax(0, …) 允许收缩');
  assert.match(columns!, /display:flex/, '用 flex 让两列各自按内容取宽');
  // 容器必须自身收缩到内容宽度：否则弹窗变宽时 flex 会把剩余空间留在末尾，
  // 右列右侧出现空白。
  assert.match(columns!, /width:max-content/, '容器必须收缩到内容宽度');
  assert.match(ruleBody('.resource-detail .resource-column') ?? '', /flex:0 0 auto/, '列宽不参与拉伸与收缩');
});

test('资源明细的数值列永不换行', () => {
  const body = ruleBody('.resource-detail .resource-factor>span.resource-factor-value');
  assert.ok(body, '数值列需要一条特异性足够、且限定在资源明细内的规则');
  assert.match(body!, /white-space:nowrap/, '数值不能折行');
  assert.match(body!, /text-align:right/, '数值保持右对齐');
  assert.match(body!, /font-variant-numeric:tabular-nums/, '数值等宽，避免逐帧抖动');
  // 早期实现写成 `.resource-factor-value{white-space:nowrap}`（特异性 0,1,0），
  // 被兄弟规则 `.resource-factor>span{white-space:normal}`（0,1,1）静默覆盖，
  // 长数值仍然折行——正是玩家看到的第一个 bug。作用域版（0,3,1）必须严格更高。
  const base = ruleBody('.resource-factor>span.resource-factor-value');
  assert.ok(base, '建筑弹窗的基础右对齐规则保留');
  assert.doesNotMatch(base!, /white-space:nowrap/, '基础规则不能声明 nowrap，否则作用域版失去意义');
});

test('新策略限定在资源明细内，不污染共用的建筑弹窗', () => {
  // `.resource-factor` 同时被建筑弹窗使用，而建筑弹窗是固定 242px 宽、
  // 必须靠换行容纳长文本。把 max-content / nowrap 写进基础规则会让 131 种
  // 建筑的效果列全部溢出——这是本次改动真实踩到的回归。
  const base = ruleBody('.resource-factor');
  assert.ok(base, '基础行规则必须保留');
  assert.doesNotMatch(base!, /max-content/, '基础行不能用 max-content，否则建筑弹窗会被撑破');
  assert.match(base!, /minmax\(0,1fr\)/, '基础行必须保留可收缩的名称列');
  // 名称列仍允许换行，这是建筑弹窗不溢出的前提。
  const span = ruleBody('.resource-factor>span');
  assert.ok(span, '基础名称列规则必须保留');
  assert.match(span!, /white-space:normal/, '建筑弹窗的长名称必须能换行');
  assert.match(span!, /overflow-wrap:anywhere/, '建筑弹窗的超长名称必须能断词');
});
