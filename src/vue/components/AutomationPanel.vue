<script setup lang="ts">
import { computed, ref } from 'vue';
import { AUTOMATION_SECTIONS, AUTOMATION_OPTIONS, CONDITION_SOURCES, TRIGGER_ACTION_OPTIONS, blankConditionRow, blankTrigger, conditionArgumentOptions } from '../../data/automation';
import { createDefaultAutomationConfig } from '../../state/automation-storage';
import { serializeAutomationConfig, parseAutomationConfig } from '../../state/automation-storage';
import type { AutomationConfig, AutomationOption, AutomationTrigger, CompareOperator, ConditionRow, ConditionSourceId } from '../../types/automation';
import type { AutomationRunReport } from '../../types/automation';

/**
 * 自动化设置面板。
 *
 * 布局与存档设置一致：折叠分节 + 每节单独重置；覆盖行与触发器用紧凑的行编辑器表达。
 * 所有取值都来自 `data/automation` 的注册表，这里不硬编码任何选项名，
 * 因此新增一个开关只需要改注册表。
 */

const props = defineProps<{
  automation: AutomationConfig;
  report: AutomationRunReport | null;
  saveFailed?: boolean;
}>();
const emit = defineEmits<{ change: [AutomationConfig, done: (saved: boolean) => void] }>();

const operators: CompareOperator[] = ['==', '!=', '>', '>=', '<', '<=', '&&', '||', 'A?B'];
const open = ref<Set<string>>(new Set(['general']));
const status = ref('');
const statusType = ref<'subtle' | 'positive' | 'negative'>('subtle');
const importText = ref('');
const editingOverrides = ref<string | null>(null);

const sections = AUTOMATION_SECTIONS;
const overrideCount = computed(() => Object.values(props.automation.overrides).reduce((sum, rows) => sum + (rows?.length ?? 0), 0));

function showStatus(text: string, type: typeof statusType.value = 'subtle'): void {
  status.value = text;
  statusType.value = type;
}

function toggleSection(id: string): void {
  const next = new Set(open.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  open.value = next;
}

function clone(): AutomationConfig {
  return parseAutomationConfig(serializeAutomationConfig(props.automation)).config;
}

function commit(next: AutomationConfig, message?: string): void {
  emit('change', next, saved => {
    if (!saved) showStatus('设置已生效，但未能写入本地存储，刷新页面后会丢失。', 'negative');
    else if (message) showStatus(message, 'positive');
  });
}

/** 数值输入框清空时退回该选项的默认值，避免把 NaN 写进配置。 */
function setValue(option: AutomationOption, raw: string): void {
  const next = clone();
  if (option.kind === 'toggle') {
    next.values[option.key] = raw === 'true';
  } else {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(option.max ?? Number.MAX_SAFE_INTEGER, Math.max(option.min ?? 0, parsed));
    next.values[option.key] = option.integer ? Math.round(clamped) : clamped;
  }
  commit(next);
}

function valueOf(key: string): number | boolean | string {
  return props.automation.values[key] ?? AUTOMATION_OPTIONS[key]?.default ?? 0;
}

function resetSection(section: typeof sections[number]): void {
  const next = clone();
  const defaults = createDefaultAutomationConfig();
  for (const option of section.options) next.values[option.key] = defaults.values[option.key] ?? option.default;
  commit(next, `已重置「${section.label}」。`);
}

function resetAll(): void {
  commit(createDefaultAutomationConfig(), '已重置全部自动化设置。');
}

function addOverrideRow(key: string): void {
  const next = clone();
  const option = AUTOMATION_OPTIONS[key];
  const rows = next.overrides[key] ?? [];
  rows.push(blankConditionRow(option?.default ?? 0));
  next.overrides[key] = rows;
  editingOverrides.value = key;
  commit(next);
}

function removeOverrideRow(key: string, index: number): void {
  const next = clone();
  const rows = next.overrides[key] ?? [];
  rows.splice(index, 1);
  if (rows.length === 0) delete next.overrides[key];
  else next.overrides[key] = rows;
  commit(next);
}

function updateRow(row: ConditionRow, patch: Partial<ConditionRow>): void {
  Object.assign(row, patch);
  commit(clone());
}

function setSource(row: ConditionRow, side: 'left' | 'right', source: ConditionSourceId): void {
  const patch: Partial<ConditionRow> = side === 'left' ? { left: source } : { right: source };
  // 换来源时把参数重置为该来源的第一个合法取值，否则会留下上一个来源的 id。
  const options = conditionArgumentOptions(source);
  const arg = options[0]?.id ?? '0';
  if (side === 'left') patch.leftArg = arg; else patch.rightArg = arg;
  updateRow(row, patch);
}

function addTrigger(): void {
  const next = clone();
  next.triggers.push(blankTrigger());
  commit(next);
}

function removeTrigger(index: number): void {
  const next = clone();
  next.triggers.splice(index, 1);
  commit(next);
}

function updateTrigger(trigger: AutomationTrigger, patch: Partial<AutomationTrigger>): void {
  Object.assign(trigger, patch);
  commit(clone());
}

function exportConfig(): void {
  importText.value = serializeAutomationConfig(props.automation);
  showStatus(`已导出 ${importText.value.length} 字符的自动化配置，请复制下面的内容备份。`, 'positive');
}

function importConfig(): void {
  const parsed = parseAutomationConfig(importText.value);
  if (parsed.restored) { showStatus('导入失败：配置无法识别，已保留当前设置。', 'negative'); return; }
  commit(parsed.config, `导入成功：已应用 ${Object.keys(parsed.config.values).length} 项设置。`);
}
</script>

<template>
  <div class="automation">
    <p v-if="props.report?.fault" class="fault" role="alert">脚本已暂停：{{ props.report.fault }}</p>
    <p v-if="props.saveFailed" class="small negative">自动化设置未能写入本地存储，刷新后会丢失。</p>

    <section v-for="section in sections" :key="section.id" class="automation-section">
      <button class="section-head" :aria-expanded="open.has(section.id)" @click="toggleSection(section.id)">
        {{ open.has(section.id) ? '▾' : '▸' }} {{ section.label }}
      </button>
      <div v-if="open.has(section.id)" class="section-body">
        <div v-for="option in section.options" :key="option.key" class="option-row" :title="option.hint">
          <span class="option-label">{{ option.label }}</span>
          <input v-if="option.kind === 'toggle'" type="checkbox" :data-automation-toggle="option.key" :checked="valueOf(option.key) === true" @change="setValue(option, String(($event.target as HTMLInputElement).checked))">
          <input v-else type="number" class="option-number" :value="valueOf(option.key)" :min="option.min ?? 0" :max="option.max ?? undefined" :step="option.integer ? 1 : 0.05" @change="setValue(option, ($event.target as HTMLInputElement).value)">
          <button class="row-add" :data-automation-override="option.key" title="为这一项加一条条件覆盖行" @click="addOverrideRow(option.key)">条件</button>
          <span v-if="props.automation.overrides[option.key]?.length" :data-automation-badge="option.key" class="override-badge" :class="{ active: editingOverrides === option.key }" @click="editingOverrides = editingOverrides === option.key ? null : option.key">
            {{ props.automation.overrides[option.key]?.length }} 条覆盖
          </span>
        </div>

        <div v-if="editingOverrides && section.options.some(option => option.key === editingOverrides)" class="override-editor">
          <div v-for="(row, index) in (props.automation.overrides[editingOverrides] ?? [])" :key="index" class="condition-row">
            <select :value="row.left" @change="setSource(row, 'left', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="conditionArgumentOptions(row.left).length" :value="row.leftArg" @change="updateRow(row, { leftArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in conditionArgumentOptions(row.left)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <select :value="row.operator" @change="updateRow(row, { operator: ($event.target as HTMLSelectElement).value as CompareOperator })">
              <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
            </select>
            <select :value="row.right" @change="setSource(row, 'right', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="conditionArgumentOptions(row.right).length" :value="row.rightArg" @change="updateRow(row, { rightArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in conditionArgumentOptions(row.right)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <input v-else type="text" class="condition-arg" :value="row.rightArg" @change="updateRow(row, { rightArg: ($event.target as HTMLInputElement).value })">
            <input type="number" class="condition-value" :value="row.value" placeholder="覆盖为" @change="updateRow(row, { value: Number(($event.target as HTMLInputElement).value) })">
            <button class="row-remove" @click="removeOverrideRow(editingOverrides!, index)">移除</button>
          </div>
          <p v-if="!(props.automation.overrides[editingOverrides] ?? []).length" class="small subtle">还没有覆盖行。加一条后，条件成立时这一项会改用覆盖值，自上而下第一个成立的生效。</p>
        </div>

        <div class="actions">
          <button class="row-reset" @click="resetSection(section)">重置本节</button>
        </div>
      </div>
    </section>

    <section v-if="props.automation.triggers.length || true" class="automation-section">
      <button class="section-head" :aria-expanded="open.has('trigger-list')" @click="toggleSection('trigger-list')">
        {{ open.has('trigger-list') ? '▾' : '▸' }} 触发器列表（{{ props.automation.triggers.length }}）
      </button>
      <div v-if="open.has('trigger-list')" class="section-body">
        <div v-for="(trigger, index) in props.automation.triggers" :key="index" class="trigger-row">
          <label class="trigger-enabled"><input type="checkbox" :checked="trigger.enabled" @change="updateTrigger(trigger, { enabled: ($event.target as HTMLInputElement).checked })"> 启用</label>
          <label class="trigger-chain"><input type="checkbox" :checked="trigger.chain" @change="updateTrigger(trigger, { chain: ($event.target as HTMLInputElement).checked })"> 依赖上一条</label>
          <select :value="trigger.left" @change="setSource(trigger, 'left', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
            <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
          </select>
          <select v-if="conditionArgumentOptions(trigger.left).length" :value="trigger.leftArg" @change="updateTrigger(trigger, { leftArg: ($event.target as HTMLSelectElement).value })">
            <option v-for="arg in conditionArgumentOptions(trigger.left)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
          </select>
          <select :value="trigger.operator" @change="updateTrigger(trigger, { operator: ($event.target as HTMLSelectElement).value as CompareOperator })">
            <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
          </select>
          <select :value="trigger.right" @change="setSource(trigger, 'right', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
            <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
          </select>
          <select v-if="conditionArgumentOptions(trigger.right).length" :value="trigger.rightArg" @change="updateTrigger(trigger, { rightArg: ($event.target as HTMLSelectElement).value })">
            <option v-for="arg in conditionArgumentOptions(trigger.right)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
          </select>
          <input v-else type="text" class="condition-arg" :value="trigger.rightArg" @change="updateTrigger(trigger, { rightArg: ($event.target as HTMLInputElement).value })">
          <select :value="trigger.action" @change="updateTrigger(trigger, { action: ($event.target as HTMLSelectElement).value as AutomationTrigger['action'], actionId: TRIGGER_ACTION_OPTIONS[($event.target as HTMLSelectElement).value as AutomationTrigger['action']]()[0]?.id ?? '' })">
            <option value="build">建造</option>
            <option value="research">研究</option>
            <option value="arpa">ARPA</option>
            <option value="queueBuild">加入建筑队列</option>
            <option value="queueResearch">加入研究队列</option>
          </select>
          <select :value="trigger.actionId" @change="updateTrigger(trigger, { actionId: ($event.target as HTMLSelectElement).value })">
            <option v-for="entry in TRIGGER_ACTION_OPTIONS[trigger.action]()" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
          </select>
          <input type="number" class="condition-value" min="1" :value="trigger.actionCount" @change="updateTrigger(trigger, { actionCount: Math.max(1, Math.round(Number(($event.target as HTMLInputElement).value) || 1)) })">
          <button class="row-remove" @click="removeTrigger(index)">移除</button>
        </div>
        <div class="actions">
          <button id="addAutomationTrigger" @click="addTrigger">新增触发器</button>
        </div>
      </div>
    </section>

    <section class="automation-section">
      <h3>自动化配置</h3>
      <textarea id="automationConfigText" class="import-box" rows="4" placeholder="粘贴自动化配置 JSON" v-model="importText"></textarea>
      <div class="actions">
        <button id="exportAutomation" @click="exportConfig">导出配置</button>
        <button id="importAutomation" :disabled="!importText.trim()" @click="importConfig">导入配置</button>
        <button id="resetAutomation" @click="resetAll">全部重置</button>
      </div>
      <p class="small subtle">自动化设置单独保存在本地存储（键 <code>meow-civilization-automation-v1</code>），与游戏存档互不影响。配置为明文 JSON，不含任何加密或防作弊措施。当前有 {{ overrideCount }} 条覆盖行。</p>
    </section>
    <p v-if="status" id="automationStatus" class="small" role="status" aria-live="polite"><span :class="statusType">{{ status }}</span></p>
  </div>
</template>

<style scoped>
.automation-section { margin-bottom: .6rem; }
.section-head { width: 100%; text-align: left; }
.section-body { padding: .4rem 0 0 .6rem; display: grid; gap: .3rem; }
.option-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.option-label { min-width: 11rem; }
.option-number { width: 6rem; }
.override-badge { font-size: .85em; opacity: .75; cursor: pointer; text-decoration: underline; }
.override-badge.active { opacity: 1; }
.override-editor { display: grid; gap: .3rem; padding: .3rem 0 .3rem .8rem; border-left: 2px solid #63b875; }
.condition-row, .trigger-row { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
.condition-arg { width: 7rem; }
.condition-value { width: 5.5rem; }
.trigger-enabled, .trigger-chain { font-size: .9em; }
.fault { color: #d05c5c; }
.negative { color: #d05c5c; }
</style>
