<script setup lang="ts">
import { ref } from 'vue';
import type { GameState } from '../../types/state';
import { CONFIG } from '../../data/config';
import { validateAndMigrateSave } from '../../state/validate-save';
import { sampleEventInterval } from '../../simulation/events';
import { clampResourcesToCaps } from '../../simulation/storage';
import { storageSnapshot, capacity } from '../format';

const GAME_SETTING_LABELS = {
  paused: '暂停游戏',
  alwaysEnableNewBuildings: '总是启用新建筑',
  unorderedBuildingQueue: '乱序建筑队列',
  queueHotkeys: '队列快捷键',
  unorderedResearchQueue: '乱序研究队列',
  touchOptimization: '触摸屏优化',
} as const;
const GAME_SETTING_HINTS = {
  paused: '暂停游戏',
  alwaysEnableNewBuildings: '无条件启用新建造的建筑，无视电力和支持',
  unorderedBuildingQueue: '建筑队列中的项目无视先后顺序，哪个先满足条件就立即完成',
  queueHotkeys: '开启队列快捷键，按住Q键点击目标将其立即添加到队列，即使资源充足，支持倍率快捷键',
  unorderedResearchQueue: '研究队列中的项目无视先后顺序，哪个先满足条件就立即完成',
  touchOptimization: '开启为触摸屏设计的UI交互优化',
} as const;

const props = defineProps<{ state: GameState; revision: number; saveBlocked?: boolean; exportProtectedSave?: () => string }>();
// Emitting a request is not proof of persistence or state replacement. The
// owner reports the actual result, including a successful load but failed save.
const emit = defineEmits<{
  save: [done: (success: boolean) => void];
  reset: [kind: 'soft' | 'hard', done: (success: boolean) => void];
  replace: [state: GameState, done: (loaded: boolean, saved?: boolean) => void];
}>();

const status = ref('');
const statusType = ref<'subtle' | 'positive' | 'negative'>('subtle');
const pending = ref(false);
const importText = ref('');
const confirmReset = ref<null | 'soft' | 'hard'>(null);

function showStatus(text: string, type: typeof statusType.value = 'subtle'): void {
  status.value = text;
  statusType.value = type;
}

function saveNow(): void {
  if (pending.value) return;
  confirmReset.value = null;
  pending.value = true;
  showStatus('正在请求保存…');
  emit('save', success => {
    pending.value = false;
    showStatus(success ? `已保存（版本 ${CONFIG.version}）` : '保存失败：未能写入本地存储，请导出存档备份。', success ? 'positive' : 'negative');
  });
}

function exportSave(): void {
  try {
    const text = JSON.stringify({ ...props.state, lastSaved: Date.now() }, null, 2);
    importText.value = text;
    confirmReset.value = null;
    showStatus(`已生成 ${text.length} 字符的存档 JSON，请复制下面的内容备份。`, 'positive');
  } catch (error) {
    showStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'negative');
  }
}

function exportOldSave(): void {
  if (pending.value || !props.saveBlocked) return;
  try {
    if (!props.exportProtectedSave) throw Error('旧存档导出不可用。');
    importText.value = props.exportProtectedSave();
    confirmReset.value = null;
    showStatus(`已原样导出被保护的旧存档（${importText.value.length}字符），请复制文本框内容备份。保护模式保持开启；当前版本不能导入此旧档。`, 'positive');
  } catch (error) {
    showStatus(`旧存档导出失败：${error instanceof Error ? error.message : String(error)}`, 'negative');
  }
}

function importSave(): void {
  if (pending.value) return;
  try {
    const raw: unknown = JSON.parse(importText.value);
    const next = validateAndMigrateSave(raw, {
      now: Date.now(),
      eventInterval: sampleEventInterval(Math.random),
      housingCapacity: state => capacity(state),
      clampResources: state => { clampResourcesToCaps(state, storageSnapshot(state)); },
    });
    confirmReset.value = null;
    pending.value = true;
    showStatus('校验通过，正在请求载入存档…');
    emit('replace', next, (loaded, saved) => {
      pending.value = false;
      if (!loaded) showStatus('导入失败：存档未载入，当前游戏未被替换。', 'negative');
      else if (saved === false) showStatus('导入已载入，但本地保存失败，请导出备份。', 'negative');
      else showStatus(saved === true ? '导入成功，已载入并保存存档。' : '导入成功，已载入存档；本地保存状态尚未确认。', 'positive');
    });
  } catch (error) {
    pending.value = false;
    showStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'negative');
  }
}

function requestReset(kind: 'soft' | 'hard'): void {
  if (pending.value) return;
  if (confirmReset.value === kind) {
    pending.value = true;
    confirmReset.value = null;
    showStatus('正在请求重置…');
    emit('reset', kind, success => {
      pending.value = false;
      showStatus(success ? (kind === 'soft' ? '已软重置。' : '已完全清空旧存档并保存新游戏，已退出保护模式。') : '重置未完成，请检查状态并先导出备份。', success ? 'positive' : 'negative');
    });
    return;
  }
  confirmReset.value = kind;
  showStatus(kind === 'soft'
    ? '再次点击确认软重置：保留威望与成就，清空本周目。'
    : '再次点击确认硬重置：完全清空存档，包括成就与威望。保存新游戏成功后退出保护模式，此操作不可撤销。');
}

function toggleGameSetting(key: keyof typeof GAME_SETTING_LABELS): void {
  props.state.settings[key] = !props.state.settings[key];
  emit('save', (_success: boolean) => undefined);
}

function cancelReset(): void {
  confirmReset.value = null;
  showStatus('已取消重置。');
}
</script>

<template>
  <div class="settings">
    <section>
      <h3>游戏设置</h3>
      <div class="actions game-settings">
        <button v-for="(_, key) in GAME_SETTING_LABELS" :key="key" class="setting-toggle" :title="GAME_SETTING_HINTS[key]" :aria-pressed="props.state.settings[key]" @click="toggleGameSetting(key)">
          {{ GAME_SETTING_LABELS[key] }}：{{ props.state.settings[key] ? '开' : '关' }}
        </button>
      </div>
    </section>
    <section>
      <h3>存档</h3>
      <div class="actions">
        <button id="saveNow" :disabled="pending" @click="saveNow">立即保存</button>
      </div>
      <p class="small subtle">自动保存每10秒写入本地存储（键 <code>{{ CONFIG.saveKey }}</code>）。</p>
    </section>
    <section>
      <h3>导入存档</h3>
      <textarea id="importSaveText" class="import-box" rows="6" placeholder="粘贴导出的存档 JSON" :disabled="pending" v-model="importText"></textarea>
      <div class="actions">
        <button id="exportProtectedSave" :disabled="pending || !saveBlocked" @click="exportOldSave">导出不兼容的旧版本存档</button>
        <button id="exportSave" :disabled="pending" @click="exportSave">导出存档</button>
        <button id="importSave" :disabled="pending || !importText.trim()" @click="importSave">导入</button>
      </div>
      <p class="small subtle">导入前先校验存档；无效内容不会覆盖当前游戏。</p>
    </section>
    <p v-if="status" id="saveStatus" class="small" role="status" aria-live="polite"><span :class="statusType">{{ status }}</span></p>
    <section>
      <h3>重置</h3>
      <div class="actions">
        <button id="softReset" :disabled="pending" :class="{ danger: confirmReset === 'soft' }" @click="requestReset('soft')">{{ confirmReset === 'soft' ? '确认软重置' : '软重置' }}</button>
        <button id="hardReset" :disabled="pending" :class="{ danger: confirmReset === 'hard' }" @click="requestReset('hard')">{{ confirmReset === 'hard' ? '确认硬重置' : '硬重置' }}</button>
        <button v-if="confirmReset" :disabled="pending" @click="cancelReset">取消</button>
      </div>
      <p class="small subtle">软重置保留威望、成就与粒子；硬重置清除一切。两种操作都不可撤销，建议先导出备份。</p>
    </section>
  </div>
</template>

<style scoped>
.setting-toggle[aria-pressed="true"] { border-color: #63b875; }
</style>
