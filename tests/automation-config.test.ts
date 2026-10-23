import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTOMATION_SECTIONS, AUTOMATION_OPTIONS, blankConditionRow, blankTrigger } from '../src/data/automation';
import {
  AUTOMATION_CONFIG_VERSION,
  AUTOMATION_STORAGE_KEY,
  createDefaultAutomationConfig,
  loadAutomationConfig,
  normalizeAutomationConfig,
  parseAutomationConfig,
  persistAutomationConfig,
  serializeAutomationConfig,
} from '../src/state/automation-storage';
import type { AutomationConfig } from '../src/types/automation';

/**
 * 自动化配置的持久化契约：合法的留下来，显式非法的整份拒绝，缺失的键用注册表默认值补齐。
 * 这份配置独立于存档，因此任何输入——包括玩家手改过的文本——都不允许抛异常。
 */

function withValues(patch: Record<string, number | boolean | string>): AutomationConfig {
  const config = createDefaultAutomationConfig();
  Object.assign(config.values, patch);
  return config;
}

test('默认配置覆盖注册表里的全部选项，且落在各自声明的范围内', () => {
  const config = createDefaultAutomationConfig();
  assert.deepEqual(Object.keys(config.values).sort(), Object.keys(AUTOMATION_OPTIONS).sort());
  for (const [key, option] of Object.entries(AUTOMATION_OPTIONS)) {
    assert.equal(typeof config.values[key], option.kind === 'toggle' ? 'boolean' : 'number', `${key} 的默认值类型`);
    if (option.kind !== 'toggle') {
      assert.ok((config.values[key] as number) >= (option.min ?? 0), `${key} 不低于下限`);
      if (option.max !== undefined) assert.ok((config.values[key] as number) <= option.max, `${key} 不超过上限`);
    }
  }
  // 每个分节登记的选项都必须真实存在，否则界面会出现点了没反应的开关。
  for (const section of AUTOMATION_SECTIONS) {
    for (const option of section.options) {
      assert.ok(Object.hasOwn(AUTOMATION_OPTIONS, option.key), `${section.id} 引用了不存在的选项 ${option.key}`);
      assert.equal(AUTOMATION_OPTIONS[option.key], option, `${section.id} 的 ${option.key} 必须与注册表同一份`);
    }
  }
});

test('默认值具体到关键开关：主开关关闭、安全模式开启、动作上限有界', () => {
  const config = createDefaultAutomationConfig();
  assert.equal(config.values.master, false);
  assert.equal(config.values.safeMode, true);
  assert.equal(config.values.tickInterval, 1);
  assert.equal(config.values.maxActionsPerRun, 40);
  assert.equal(config.version, AUTOMATION_CONFIG_VERSION);
});

test('缺失的键补默认值，显式非法值拒绝整份配置', () => {
  // 只给一个键：其余用默认值补齐，不算错误。
  const partial = normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { tickInterval: 5 } });
  assert.ok(partial);
  assert.equal(partial.values.tickInterval, 5);
  assert.equal(partial.values.maxActionsPerRun, 40);

  // 版本号不符、类型错、越界、未知选项键——都必须整体拒绝，不能静默修复。
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION + 1, values: {} }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { master: 1 } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { tickInterval: 0 } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { tickInterval: 1.5 } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { tickInterval: 999 } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: { maxActionsPerRun: -3 } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: {}, overrides: { notARealOption: [] } }), null);
  assert.equal(normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, overrides: { master: [{ left: 'nope', leftArg: '', operator: '>', right: 'cash', rightArg: '' }] } }), null);
});

test('非法文本、非 JSON、空输入一律回退到默认值并标记 restored', () => {
  const blank = parseAutomationConfig(null);
  assert.equal(blank.restored, false);
  assert.deepEqual(blank.config, createDefaultAutomationConfig());

  for (const text of ['', '{', 'null', '[]', '"x"', '{"version":99}', '{"version":1,"values":{"master":"yes"}}']) {
    const parsed = parseAutomationConfig(text);
    assert.equal(parsed.restored, true, `${text} 应回退`);
    assert.deepEqual(parsed.config, createDefaultAutomationConfig());
  }
});

test('存档往返保持每一项取值，包括覆盖行与触发器', () => {
  const config = withValues({ master: true, autoBuild: true, researchKeepKnowledge: 250 });
  // 覆盖行与触发器都用注册表自己的模板，只改必要字段：
  // 目标是"这条覆盖行/触发器被原样保存回来"，不是造一个非法行。
  config.overrides.maxActionsPerRun = [{ ...blankConditionRow(), value: 500 }];
  config.triggers.push({ ...blankTrigger(), action: 'build', actionId: 'nest', actionCount: 2 });
  const round = parseAutomationConfig(serializeAutomationConfig(config));
  assert.equal(round.restored, false);
  assert.deepEqual(round.config, config);
  assert.equal(round.config.triggers[0]?.actionCount, 2);
  assert.equal(round.config.overrides.maxActionsPerRun?.[0]?.value, 500);
});

test('真正写坏的行会被拒绝：对照上面那条合法行，证明校验不是摆设', () => {
  const config = withValues({ master: true });
  // 条件来源不是注册表里的 id 时整份配置被拒绝，而不是被悄悄丢掉那一行。
  config.overrides.maxActionsPerRun = [{ ...blankConditionRow(), right: 'cash', rightArg: 'not-a-number' } as never];
  assert.equal(normalizeAutomationConfig(JSON.parse(serializeAutomationConfig(config))), null);
});

test('读取与写入都不抛异常：存储坏了只是丢配置，不能影响游戏启动', () => {
  const throwingReader = { getItem() { throw new Error('boom'); } };
  const fromBroken = loadAutomationConfig(throwingReader);
  assert.equal(fromBroken.restored, true);
  assert.deepEqual(fromBroken.config, createDefaultAutomationConfig());

  const seen: Record<string, string> = {};
  const reader = {
    getItem(key: string) { return key === AUTOMATION_STORAGE_KEY ? '{"version":1,"values":{"master":true}}' : null; },
  };
  const loaded = loadAutomationConfig(reader);
  assert.equal(loaded.restored, false);
  assert.equal(loaded.config.values.master, true);

  assert.equal(persistAutomationConfig({ setItem(key, value) { seen[key] = value; } }, loaded.config), true);
  assert.ok((seen[AUTOMATION_STORAGE_KEY] ?? '').includes('"master":true'));
  assert.equal(persistAutomationConfig({ setItem() { throw new Error('quota'); } }, loaded.config), false);
});

test('归一化不修改输入对象：坏数据被拒绝后原对象保持原样', () => {
  const input = { version: AUTOMATION_CONFIG_VERSION, values: { master: false, tickInterval: 3 }, overrides: {}, triggers: [] };
  const frozen = JSON.stringify(input);
  const normalized = normalizeAutomationConfig(input);
  assert.ok(normalized);
  assert.equal(JSON.stringify(input), frozen);
  normalized.values.master = true;
  assert.equal(input.values.master, false);
});
