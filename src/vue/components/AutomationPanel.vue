<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  AUTOMATION_SECTIONS, AUTOMATION_OPTIONS, CONDITION_SOURCES, TRIGGER_ACTIONS, TRIGGER_ACTION_SPECS,
  blankConditionRow, blankTrigger, compositeConditionArguments, conditionArgumentOptions, triggerActionOptions,
} from '../../data/automation';
import { createDefaultAutomationConfig, parseAutomationConfig, serializeAutomationConfig } from '../../state/automation-storage';
import type { AutomationConfig, AutomationOption, AutomationRunReport, AutomationTrigger, CompareOperator, ConditionRow, ConditionSourceId, TriggerActionType } from '../../types/automation';

/**
 * 自动化设置面板。
 *
 * 布局参照参考脚本的“高级设置”：分节折叠 + 每个选项一行；**Ctrl/⌘ + 左键点击选项本身**
 * 打开该选项的覆盖编辑器，被覆盖的行整体变灰。
 *
 * 所有取值都来自 `data/automation` 的注册表，这里不硬编码任何选项名，
 * 因此新增一个开关只需要改注册表。
 */

const props = defineProps<{
  automation: AutomationConfig;
  report: AutomationRunReport | null;
  saveFailed?: boolean;
}>();
const emit = defineEmits<{ change: [AutomationConfig, done: (saved: boolean) => void] }>();

const operators: CompareOperator[] = [
  '==', '!=', '===', '!==', '>', '<', '>=', '<=', '&&', '||',
  'NAND', 'NOR', 'XOR', 'XNOR', 'AND!', 'OR!', 'A?B', '!A?B',
];
const open = ref<Set<string>>(new Set(['general']));
const status = ref('');
const statusType = ref<'subtle' | 'positive' | 'negative'>('subtle');
const importText = ref('');
const editingOverrides = ref<string | null>(null);
const editingTriggers = ref(false);

/** 当前正在编辑覆盖行的选项；`editingOverrides` 可能指向已被删除的键，这里统一兜底。 */
const editingOption = computed<AutomationOption | null>(() =>
  editingOverrides.value === null ? null : AUTOMATION_OPTIONS[editingOverrides.value] ?? null);

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

/** 任意控件改动都走这里：把新值写进配置副本后整体提交。 */
function setValue(option: AutomationOption, value: unknown): void {
  const next = clone();
  next.values[option.key] = value;
  commit(next);
}

function setToggle(option: AutomationOption, event: Event): void {
  setValue(option, (event.target as HTMLInputElement).checked);
}

function setNumber(option: AutomationOption, event: Event): void {
  const parsed = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(parsed)) return;
  const clamped = Math.min(option.max ?? Number.MAX_SAFE_INTEGER, Math.max(option.min ?? 0, parsed));
  setValue(option, option.integer ? Math.round(clamped) : clamped);
}

function valueOf(key: string): unknown {
  return props.automation.values[key] ?? AUTOMATION_OPTIONS[key]?.default;
}

function listOf(key: string): string[] {
  const value = valueOf(key);
  return Array.isArray(value) ? value : [];
}

function addListEntry(option: AutomationOption, id: string): void {
  if (!id) return;
  const current = listOf(option.key);
  if (current.includes(id)) return;
  setValue(option, [...current, id]);
}

function removeListEntry(option: AutomationOption, id: string): void {
  setValue(option, listOf(option.key).filter(entry => entry !== id));
}

function moveListEntry(option: AutomationOption, id: string, delta: number): void {
  const current = [...listOf(option.key)];
  const index = current.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= current.length) return;
  current.splice(index, 1);
  current.splice(target, 0, id);
  setValue(option, current);
}

/** 列表项显示名：从 listSource 或条件来源名表里查，查不到就显示原始 id。 */
function listLabel(option: AutomationOption, id: string): string {
  const source = option.listSource?.() ?? [];
  return source.find(entry => entry.id === id)?.label ?? id;
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

// ---------------------------------------------------------------- 覆盖（高级设置）

/** Ctrl/⌘ + 左键点击选项本身：打开覆盖编辑器，与参考脚本的交互一致。 */
function optionClick(option: AutomationOption, event: MouseEvent): void {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  editingOverrides.value = editingOverrides.value === option.key ? null : option.key;
}

function addOverrideRow(key: string): void {
  const next = clone();
  const option = AUTOMATION_OPTIONS[key];
  const rows = next.overrides[key] ?? [];
  const seed = option?.kind === 'list'
    ? (option.listSource?.()[0]?.id ?? '')
    : (option?.default ?? 0);
  rows.push(blankConditionRow(seed as number | boolean | string));
  if (rows.length === 1) rows[0]!.rightArg = '0.9';
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

function moveOverrideRow(key: string, index: number, delta: number): void {
  const next = clone();
  const rows = next.overrides[key] ?? [];
  const target = index + delta;
  if (target < 0 || target >= rows.length) return;
  const [row] = rows.splice(index, 1);
  if (row) rows.splice(target, 0, row);
  next.overrides[key] = rows;
  commit(next);
}

function updateRow(row: ConditionRow, patch: Partial<ConditionRow>): void {
  Object.assign(row, patch);
  commit(clone());
}

function setSource(row: ConditionRow, side: 'left' | 'right', source: ConditionSourceId): void {
  // 换来源时把参数重置为该来源的第一个合法取值，否则会留下上一个来源的 id。
  const options = compositeConditionArguments(source).length > 0
    ? compositeConditionArguments(source)
    : conditionArgumentOptions(source);
  const arg = options[0]?.id ?? '0';
  updateRow(row, side === 'left' ? { left: source, leftArg: arg } : { right: source, rightArg: arg });
}

/** 某个来源的参数候选：优先用“组合参数”（如 建筑.资源），其次用普通候选。 */
function argOptions(source: ConditionSourceId): { id: string; label: string }[] {
  const composite = compositeConditionArguments(source);
  return composite.length > 0 ? composite : conditionArgumentOptions(source);
}

// ---------------------------------------------------------------- 触发器

function addTrigger(): void {
  const next = clone();
  const trigger = blankTrigger();
  next.triggers.push(trigger);
  editingTriggers.value = true;
  commit(next);
}

function removeTrigger(index: number): void {
  const next = clone();
  next.triggers.splice(index, 1);
  commit(next);
}

function duplicateTrigger(index: number): void {
  const next = clone();
  const source = next.triggers[index];
  if (!source) return;
  const copy = blankTrigger();
  next.triggers.splice(index + 1, 0, { ...source, id: copy.id });
  commit(next);
}

function moveTrigger(index: number, delta: number): void {
  const next = clone();
  const target = index + delta;
  if (target < 0 || target >= next.triggers.length) return;
  const [trigger] = next.triggers.splice(index, 1);
  if (trigger) next.triggers.splice(target, 0, trigger);
  commit(next);
}

function updateTrigger(trigger: AutomationTrigger, patch: Partial<AutomationTrigger>): void {
  Object.assign(trigger, patch);
  commit(clone());
}

function setTriggerAction(trigger: AutomationTrigger, action: TriggerActionType): void {
  const options = triggerActionOptions(action);
  updateTrigger(trigger, { action, actionId: options[0]?.id ?? '' });
}

// ---------------------------------------------------------------- 导出与导入

function exportConfig(): void {
  importText.value = serializeAutomationConfig(props.automation);
  showStatus(`已导出 ${importText.value.length} 字符的自动化配置，请复制下面的内容备份。`, 'positive');
}

function importConfig(): void {
  const parsed = parseAutomationConfig(importText.value);
  if (parsed.restored) { showStatus('导入失败：配置无法识别，已保留当前设置。', 'negative'); return; }
  commit(parsed.config, `导入成功：已应用 ${Object.keys(parsed.config.values).length} 项设置。`);
}

function triggerLabel(index: number, trigger: AutomationTrigger): string {
  const spec = TRIGGER_ACTION_SPECS[trigger.action];
  const options = triggerActionOptions(trigger.action);
  const target = options.find(entry => entry.id === trigger.actionId)?.label ?? trigger.actionId;
  return `${index + 1}. ${spec?.label ?? trigger.action} ${target}`;
}
</script>

<template>
  <div class="automation">
    <p v-if="props.report?.fault" class="fault" role="alert">脚本已暂停：{{ props.report.fault }}</p>
    <p v-if="props.saveFailed" class="small negative">自动化设置未能写入本地存储，刷新后会丢失。</p>

    <section class="automation-section">
      <button class="section-head" :aria-expanded="editingTriggers" @click="editingTriggers = !editingTriggers">
        {{ editingTriggers ? '▾' : '▸' }} 触发器（{{ props.automation.triggers.length }} 条）
      </button>
      <div v-if="editingTriggers" class="section-body">
        <div v-for="(trigger, index) in props.automation.triggers" :key="trigger.id" class="trigger-row" :data-automation-trigger="trigger.id">
          <div class="trigger-head">
            <label class="trigger-toggle" :title="trigger.enabled ? '点击停用' : '点击启用'">
              <input type="checkbox" :checked="trigger.enabled" @change="updateTrigger(trigger, { enabled: ($event.target as HTMLInputElement).checked })">
              <span>{{ triggerLabel(index, trigger) }}</span>
            </label>
            <span class="trigger-actions">
              <button class="row-mini" title="上移" @click="moveTrigger(index, -1)">上移</button>
              <button class="row-mini" title="下移" @click="moveTrigger(index, 1)">下移</button>
              <button class="row-mini" title="复制" @click="duplicateTrigger(index)">复制</button>
              <button class="row-mini" title="删除" @click="removeTrigger(index)">删除</button>
            </span>
          </div>

          <div class="condition-row">
            <label class="chain"><input type="checkbox" :checked="trigger.chain" @change="updateTrigger(trigger, { chain: ($event.target as HTMLInputElement).checked })"> 接在上一条之后</label>
          </div>

          <div class="condition-row">
            <span class="row-label">条件</span>
            <select :value="trigger.left" @change="setSource(trigger, 'left', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="argOptions(trigger.left).length" :value="trigger.leftArg" @change="updateTrigger(trigger, { leftArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in argOptions(trigger.left)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <input v-else type="text" class="condition-arg" :value="trigger.leftArg" @change="updateTrigger(trigger, { leftArg: ($event.target as HTMLInputElement).value })">
            <select :value="trigger.operator" @change="updateTrigger(trigger, { operator: ($event.target as HTMLSelectElement).value as CompareOperator })">
              <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
            </select>
            <select :value="trigger.right" @change="setSource(trigger, 'right', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="argOptions(trigger.right).length" :value="trigger.rightArg" @change="updateTrigger(trigger, { rightArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in argOptions(trigger.right)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <input v-else type="text" class="condition-arg" :value="trigger.rightArg" @change="updateTrigger(trigger, { rightArg: ($event.target as HTMLInputElement).value })">
          </div>

          <div class="condition-row">
            <span class="row-label">动作</span>
            <select :value="trigger.action" @change="setTriggerAction(trigger, ($event.target as HTMLSelectElement).value as TriggerActionType)">
              <option v-for="spec in TRIGGER_ACTIONS" :key="spec.value" :value="spec.value" :title="spec.hint">{{ spec.label }}</option>
            </select>
            <select :value="trigger.actionId" @change="updateTrigger(trigger, { actionId: ($event.target as HTMLSelectElement).value })">
              <option v-for="entry in triggerActionOptions(trigger.action)" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
            </select>
            <span class="row-label">数量</span>
            <input type="number" class="condition-value" :value="trigger.actionCount" min="1" @change="updateTrigger(trigger, { actionCount: Math.max(1, Math.round(Number(($event.target as HTMLInputElement).value) || 1)) })">
          </div>
        </div>

        <div class="actions">
          <button class="row-add" data-automation-add-trigger @click="addTrigger">新增触发器</button>
        </div>
        <p v-if="props.automation.triggers.length === 0" class="small subtle">还没有触发器。触发器让脚本在指定条件成立时执行一个动作，自上而下按顺序判定。</p>
      </div>
    </section>

    <section v-for="section in sections" :key="section.id" class="automation-section">
      <button class="section-head" :aria-expanded="open.has(section.id)" @click="toggleSection(section.id)">
        {{ open.has(section.id) ? '▾' : '▸' }} {{ section.label }}
      </button>
      <div v-if="open.has(section.id)" class="section-body">
        <div
          v-for="option in section.options"
          :key="option.key"
          class="option-row"
          :class="{ inactive: props.automation.overrides[option.key]?.length, 'is-overridden': props.report?.overridden?.includes(option.key) }"
          :title="option.hint"
          @click="optionClick(option, $event)"
        >
          <span class="option-label">{{ option.label }}</span>

          <input v-if="option.kind === 'toggle'" type="checkbox" :data-automation-toggle="option.key" :checked="valueOf(option.key) === true" @change="setToggle(option, $event)">
          <input v-else-if="option.kind === 'number'" type="number" class="option-number" :data-automation-number="option.key" :value="valueOf(option.key)" :min="option.min ?? 0" :max="option.max ?? undefined" :step="option.integer ? 1 : 0.05" @change="setNumber(option, $event)">
          <input v-else-if="option.kind === 'string'" type="text" class="option-text" :value="valueOf(option.key)" @change="setValue(option, ($event.target as HTMLInputElement).value)">
          <select v-else-if="option.kind === 'select'" :data-automation-select="option.key" :value="valueOf(option.key)" @change="setValue(option, ($event.target as HTMLSelectElement).value)">
            <option v-for="choice in option.choices" :key="choice.value" :value="choice.value" :title="choice.hint">{{ choice.label }}</option>
          </select>
          <span v-else class="option-list">
            <span v-for="id in listOf(option.key)" :key="id" class="list-chip">
              {{ listLabel(option, id) }}
              <button class="chip-btn" title="上移" @click.stop="moveListEntry(option, id, -1)">上</button>
              <button class="chip-btn" title="下移" @click.stop="moveListEntry(option, id, 1)">下</button>
              <button class="chip-btn" title="移除" @click.stop="removeListEntry(option, id)">×</button>
            </span>
            <select class="list-add" value="" @change="addListEntry(option, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="">增加……</option>
              <option v-for="entry in (option.listSource?.() ?? [])" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
            </select>
          </span>

          <span v-if="props.automation.overrides[option.key]?.length" :data-automation-badge="option.key" class="override-badge" :class="{ active: editingOverrides === option.key }" @click.stop="editingOverrides = editingOverrides === option.key ? null : option.key">
            {{ props.automation.overrides[option.key]?.length }} 条覆盖
          </span>
        </div>

        <div v-if="editingOverrides && section.options.some(option => option.key === editingOverrides)" class="override-editor">
          <div v-for="(row, index) in (props.automation.overrides[editingOverrides] ?? [])" :key="index" class="condition-row">
            <span class="row-order">{{ index + 1 }}</span>
            <select :value="row.left" @change="setSource(row, 'left', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="argOptions(row.left).length" :value="row.leftArg" @change="updateRow(row, { leftArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in argOptions(row.left)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <input v-else type="text" class="condition-arg" :value="row.leftArg" @change="updateRow(row, { leftArg: ($event.target as HTMLInputElement).value })">
            <select :value="row.operator" @change="updateRow(row, { operator: ($event.target as HTMLSelectElement).value as CompareOperator })">
              <option v-for="op in operators" :key="op" :value="op">{{ op }}</option>
            </select>
            <select :value="row.right" @change="setSource(row, 'right', ($event.target as HTMLSelectElement).value as ConditionSourceId)">
              <option v-for="source in CONDITION_SOURCES" :key="source.id" :value="source.id">{{ source.label }}</option>
            </select>
            <select v-if="argOptions(row.right).length" :value="row.rightArg" @change="updateRow(row, { rightArg: ($event.target as HTMLSelectElement).value })">
              <option v-for="arg in argOptions(row.right)" :key="arg.id" :value="arg.id">{{ arg.label }}</option>
            </select>
            <input v-else type="text" class="condition-arg" :value="row.rightArg" @change="updateRow(row, { rightArg: ($event.target as HTMLInputElement).value })">
            <select v-if="editingOption?.kind === 'select'" :value="String(row.value ?? '')" @change="updateRow(row, { value: ($event.target as HTMLSelectElement).value })">
              <option value="">覆盖为……</option>
              <option v-for="choice in (editingOption.choices ?? [])" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
            </select>
            <select v-else-if="editingOption?.kind === 'toggle'" :value="String(row.value ?? '')" @change="updateRow(row, { value: ($event.target as HTMLSelectElement).value === 'true' })">
              <option value="">覆盖为……</option>
              <option value="true">开启</option>
              <option value="false">关闭</option>
            </select>
            <select v-else-if="editingOption?.kind === 'list'" @change="updateRow(row, { value: ($event.target as HTMLSelectElement).value })">
              <option value="">覆盖为……</option>
              <option v-for="entry in (editingOption.listSource?.() ?? [])" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
            </select>
            <input v-else type="number" class="condition-value" :value="row.value" placeholder="覆盖为" @change="updateRow(row, { value: Number(($event.target as HTMLInputElement).value) })">
            <button class="row-mini" @click="moveOverrideRow(editingOverrides!, index, -1)">上移</button>
            <button class="row-mini" @click="removeOverrideRow(editingOverrides!, index)">移除</button>
          </div>
          <div class="actions">
            <button class="row-add" :data-automation-override="editingOverrides" @click="addOverrideRow(editingOverrides!)">新增覆盖行</button>
          </div>
          <p v-if="!(props.automation.overrides[editingOverrides] ?? []).length" class="small subtle">还没有覆盖行。加一条后，条件成立时这一项会改用覆盖值，自上而下第一个成立的生效。</p>
        </div>

        <div class="actions">
          <button class="row-reset" @click="resetSection(section)">重置本节</button>
        </div>
      </div>
    </section>

    <section class="automation-section">
      <button class="section-head" :aria-expanded="open.has('io')" @click="toggleSection('io')">
        {{ open.has('io') ? '▾' : '▸' }} 导出与导入（{{ overrideCount }} 条覆盖）
      </button>
      <div v-if="open.has('io')" class="section-body">
        <textarea id="automationConfigText" v-model="importText" class="import-box" placeholder="点击“导出”生成配置文本，或粘贴配置后点击“导入”"></textarea>
        <div class="actions">
          <button id="exportAutomation" @click="exportConfig">导出</button>
          <button id="importAutomation" @click="importConfig">导入</button>
          <button id="resetAutomation" @click="resetAll">全部重置</button>
        </div>
        <p v-if="status" class="small" :class="statusType">{{ status }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.automation { display: flex; flex-direction: column; gap: 8px; }
.automation-section { border: 1px solid rgba(127, 127, 127, 0.3); border-radius: 6px; padding: 6px 8px; }
.section-head { width: 100%; text-align: left; background: none; border: none; font: inherit; font-weight: 600; cursor: pointer; padding: 2px 0; }
.section-body { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; }
.option-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 2px 4px; border-radius: 4px; }
.option-row:hover { background: rgba(127, 127, 127, 0.12); }
.option-row.inactive .option-label { opacity: 0.55; }
.option-row.is-overridden { box-shadow: inset 2px 0 0 var(--accent, #4c8bf5); }
.option-label { overflow: hidden; text-overflow: ellipsis; }
.option-number { width: 96px; }
.option-text { width: 140px; }
.option-list { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; align-items: center; }
.list-chip { display: inline-flex; align-items: center; gap: 2px; background: rgba(127, 127, 127, 0.18); border-radius: 10px; padding: 1px 6px; font-size: 12px; }
.chip-btn { border: none; background: none; cursor: pointer; padding: 0 2px; font: inherit; opacity: 0.7; }
.chip-btn:hover { opacity: 1; }
.list-add { font-size: 12px; }
.override-badge { font-size: 12px; padding: 1px 6px; border-radius: 10px; background: rgba(76, 139, 245, 0.2); cursor: pointer; }
.override-badge.active { background: rgba(76, 139, 245, 0.45); }
.override-editor { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-left: 2px solid var(--accent, #4c8bf5); margin: 4px 0 4px 8px; }
.condition-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.row-label { font-size: 12px; opacity: 0.75; }
.row-order { font-size: 12px; opacity: 0.6; width: 16px; }
.condition-arg { width: 90px; }
.condition-value { width: 90px; }
.trigger-row { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px dashed rgba(127, 127, 127, 0.35); border-radius: 4px; }
.trigger-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.trigger-toggle { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.trigger-actions { display: flex; gap: 4px; }
.chain { font-size: 12px; display: flex; align-items: center; gap: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
.row-add, .row-reset, .row-mini { font-size: 12px; padding: 2px 8px; border-radius: 4px; cursor: pointer; }
.fault { color: #d64545; }
.small { font-size: 12px; }
.subtle { opacity: 0.65; }
.positive { color: #2e7d32; }
.negative { color: #d64545; }
.import-box { width: 100%; min-height: 90px; font-family: monospace; font-size: 12px; }
</style>
