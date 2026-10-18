<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { addLog, updateProgression } from '../simulation/progression';
import { ACHIEVEMENTS } from '../data/progression';
import { hasContinuousEnergyInput } from '../simulation/building-production';
import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';
import { sampleEventInterval } from '../simulation/events';
import { requestPurchaseModule, buyBuildingsInBatch, removeQueuedPurchase, describeQueuedPurchases } from '../simulation/purchases';

import { changeWorkerAssignment, changeFactoryAssignment, changeSmelterAssignment, changeGovernment, createContainers, changeContainerAssignment, createAlloyContainers, changeAlloyContainerAssignment, craftManually } from '../simulation/commands';
import type { RegionalMissionId } from '../simulation/space-missions';
import { clampResourcesToCaps } from '../simulation/storage';
import type { ResourceId, ResourceAmounts } from '../types/economy';
import { RESOURCES } from '../data/resources';
import { uiPreview } from './preview-cache';
import { estimateQueueTimes } from './queue-estimates';
import { changeCraftAssignment } from '../simulation/crafting';
import { setAutoWorkersEnabled, setAutoWorkerEnabled, setAutoWorkerLimit, moveAutoWorkerPriority, applyAutoWorkerAssignment } from '../simulation/auto-workers';
import { trimFactoryAssignments } from '../simulation/factory';
import { fillNuclearProject, launchNuclearPrestige, launchEscapePrestige, launchBlackHolePrestige, launchDigitalAscension } from '../simulation/prestige';
import { TECHNOLOGIES } from '../data/technologies';
import { calculateContainerCapacity, calculateAlloyContainerCapacity } from '../simulation/containers';
import { changeEjectionAllocation } from '../simulation/black-hole';
import { investInProject } from '../simulation/projects';
import { enqueueProject } from '../simulation/project-queue';
import { buildingQueueCapacity, buildingQueueUsage, researchQueueCapacity } from '../simulation/queue-settings';
import type { CrisprUpgradeId, DnaId, GovernmentId, GameState } from '../types/state';
import { launchChallenges } from '../simulation/challenges';
import type { ChallengeGeneId } from '../types/state';
import { purchaseCrisprUpgrade } from '../simulation/crispr';
import { craftDna, upgradeGene } from '../simulation/genes';
import { setBuildingPowerEnabled } from '../simulation/power-grid';
import { isPrestigeResourceUnlocked } from '../simulation/prestige-unlocks';
import { storageSnapshot, storageCap, moonSnapshot } from './format';
import CivilizationPanel from './components/CivilizationPanel.vue';
import ResourcePanel from './components/ResourcePanel.vue';
import CraftingPanel from './components/CraftingPanel.vue';
import BuildingsPanel from './components/BuildingsPanel.vue';
import TechPanel from './components/TechPanel.vue';
import CatsPanel from './components/CatsPanel.vue';
import InternalPanel from './components/InternalPanel.vue';
import ArpaPanel from './components/ArpaPanel.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import StoryPanel from './components/StoryPanel.vue';
import { isHyperspaceUnlocked } from '../simulation/stage-three';
import { markStoryRead } from '../simulation/story';
import type { StoryChapterId } from '../types/state';
import { CONFIG } from '../data/config';
import AchievementsPanel from './components/AchievementsPanel.vue';
import PerksPanel from './components/PerksPanel.vue';
import ResourceManagementPanel from './components/ResourceManagementPanel.vue';
import TipsPanel from './components/TipsPanel.vue';
import FactoryModal from './components/FactoryModal.vue';
import DownloadModal from './components/DownloadModal.vue';
import { changeDownloadAllocation } from '../simulation/download-command';
import SmelterModal from './components/SmelterModal.vue';
import GeneSynthesisModal from './components/GeneSynthesisModal.vue';
import { changeGeneSynthesisRate } from '../simulation/genes';
import SpaceshipModal from './components/SpaceshipModal.vue';
import { investInShipComponent, type ShipComponentId } from '../simulation/spaceship';
import TooltipPanel from './components/TooltipPanel.vue';
import type { GameStore } from '../app/store';

const props = defineProps<{ store: GameStore }>();

const TABS: { id: string; label: string }[] = [
  { id: 'buildings', label: '世界' },
  { id: 'internal', label: '内部管理' },
  { id: 'cats', label: '猫猫' },
  { id: 'tech', label: '科技' },
  { id: 'arpa', label: 'A.R.P.A' },
  { id: 'resourceManagement', label: '资源管理' },
  { id: 'tips', label: 'Tips' },
  { id: 'statistics', label: '统计' },
  { id: 'story', label: '剧情' },
  { id: 'settings', label: '设置' },
];

const activeTab = ref('buildings');
const statisticsView = ref('info');
const unreadStories = computed(() => { props.store.revision(); const archive = props.store.state().story; return archive.unlocked.filter(id => !archive.read.includes(id)).length; });
function readStory(id: StoryChapterId): void {
  props.store.mutate(state => markStoryRead(state, id));
  props.store.runtime.save();
}
const worldView = ref('home');
// A locked 超空间 (before 异常区域测绘, e.g. after loading another save) falls back to 地面.
const currentWorldView = computed(() => {
  props.store.revision();
  if (worldView.value === 'world_execution' && !props.store.state().tech.includes('aiCoreCalibration')) return 'home';
  return worldView.value === 'hyperspace' && !isHyperspaceUnlocked(props.store.state()) ? 'home' : worldView.value;
});
const techView = ref('available');
const logFilter = ref('all');
const logFilters = [{ id: 'all', name: '全部' }, { id: 'queue', name: '队列' }, { id: 'event', name: '普通事件' }, { id: 'progress', name: '进度事件' }, { id: 'achievement', name: '成就' }, { id: 'system', name: '系统' }];
const visibleLogs = computed(() => { props.store.revision(); return state.value.logs.filter(log => logFilter.value === 'all' || log.type === logFilter.value); });
// UI-only identity survives filtering/prepending, including identical time/text logs.
// Weak keys do not retain discarded logs and never change the save schema.
const logKeys = new WeakMap<GameState['logs'][number], number>();
let nextLogKey = 0;
function logKey(log: GameState['logs'][number]): number {
  let key = logKeys.get(log);
  if (key === undefined) { key = nextLogKey++; logKeys.set(log, key); }
  return key;
}
const actionError = ref('');
function replaceRun(next: GameState): boolean {
  try {
    props.store.runtime.replaceState(next);
    actionError.value = '';
    return true;
  } catch {
    actionError.value = '操作失败：新周目数据未通过校验，当前周目未替换。请导出备份后重试。';
    return false;
  }
}
const saveStatus = computed(() => { props.store.revision(); return props.store.runtime.saveBlocked ? '保护模式 · 请先到设置导出原档备份' : props.store.runtime.saveFailed ? '本地保存失败，请导出备份' : '本地存档 · 自动保存已启用'; });

function afterAction(): void {
  props.store.mutate(s => { for (const id of updateProgression(s)) addLog(s, `成就达成：${ACHIEVEMENTS[id].name}`, 'achievement'); });
  props.store.runtime.save();
  props.store.refresh();
}

// The runtime owns the simulation; Vue only mirrors it through this counter.
const state = computed(() => {
  props.store.revision();
  return props.store.state();
});

const resourceManagementUnlocked = computed(() => {
  props.store.revision();
  return calculateContainerCapacity(state.value) > 0 || state.value.containers > 0 || calculateAlloyContainerCapacity(state.value) > 0 || state.value.alloyContainers > 0 || state.value.buildings.massEjector > 0;
});
watch(resourceManagementUnlocked, unlocked => { if (!unlocked && activeTab.value === 'resourceManagement') activeTab.value = 'buildings'; });

const gameDate = computed(() => {
  props.store.revision();
  const days = Math.floor(state.value.time / CONFIG.secondsPerDay);
  return `${Math.floor(days / CONFIG.daysPerYear)}年${(days % CONFIG.daysPerYear) + 1}日`;
});

const guide = computed(() => {
  props.store.revision();
  if (state.value.tech.includes('spaceflight')) return '已掌握太空航行，前往世界的太空页探索。';
  if (state.value.arpaBuildings.rocketPlatform > 0) return '火箭发射台已建成，继续推进 ARPA 工程。';
  return '从猫爪开始，一点一滴长成文明。';
});

function buy(id: BuildingId, count: number, forceQueue = false): void {
  props.store.mutate(s => {
    const moonAvailable = () => moonSnapshot(s).available;
    if (forceQueue) for (let i = 0; i < count; i++) requestPurchaseModule(s, 'build', id, moonAvailable, true);
    else if (count === 1) requestPurchaseModule(s, 'build', id, moonAvailable);
    else buyBuildingsInBatch(s, id, count, moonAvailable);
  });
  afterAction();
}

function toggle(id: BuildingId, delta: number): void {
  props.store.mutate(s => {
    if (!hasContinuousEnergyInput(id, s) || !Number.isSafeInteger(delta)) return;
    setBuildingPowerEnabled(s, id, delta);
    trimFactoryAssignments(s);
    clampResourcesToCaps(s, storageSnapshot(s));
  });
  afterAction();
}

function assignWorker(id: BuildingId, delta: number): void {
  props.store.mutate(s => { changeWorkerAssignment(s, id, delta); });
  afterAction();
}

function changeAutoWorkersEnabled(enabled: boolean): void {
  props.store.mutate(s => {
    setAutoWorkersEnabled(s, enabled);
    if (enabled) applyAutoWorkerAssignment(s);
  });
  afterAction();
}

function changeAutoWorkerEnabled(id: BuildingId, enabled: boolean): void {
  props.store.mutate(s => {
    setAutoWorkerEnabled(s, id, enabled);
    applyAutoWorkerAssignment(s);
  });
  afterAction();
}

function changeAutoWorkerLimit(id: BuildingId, limit: number): void {
  props.store.mutate(s => {
    setAutoWorkerLimit(s, id, limit);
    applyAutoWorkerAssignment(s);
  });
  afterAction();
}

function changeAutoWorkerPriority(sourceId: BuildingId, targetId: BuildingId): void {
  props.store.mutate(s => {
    moveAutoWorkerPriority(s, sourceId, targetId);
    applyAutoWorkerAssignment(s);
  });
  afterAction();
}

function changeAutoWorkerOrder(priority: BuildingId[]): void {
  const current = state.value.autoWorkers.priority;
  if (priority.length !== current.length || new Set(priority).size !== current.length || priority.some(id => !current.includes(id))) return;
  props.store.mutate(s => {
    s.autoWorkers.priority = [...priority];
    applyAutoWorkerAssignment(s);
  });
  afterAction();
}

function gather(id: 'food' | 'wood' | 'stone'): void {
  props.store.mutate(s => {
    const was = s.resources[id];
    s.resources[id] = Math.min(storageCap(id, s), was + 2);
    s.clicks++;
  });
}

function research(id: TechnologyId, forceQueue = false): void {
  // 奇异失控 never queues: the click itself triggers the black-hole reset.
  if (TECHNOLOGIES[id].prestigeReset) { confirmBlackHole(); return; }
  props.store.mutate(s => { requestPurchaseModule(s, 'tech', id, () => moonSnapshot(s).available, forceQueue); });
  afterAction();
}

function mission(id: RegionalMissionId, forceQueue = false): void {
  props.store.mutate(s => { requestPurchaseModule(s, 'mission', id, () => moonSnapshot(s).available, forceQueue); });
  afterAction();
}

function assignCraft(id: string, delta: number): void {
  props.store.mutate(s => { changeCraftAssignment(s, id, delta); });
  afterAction();
}

function reform(id: GovernmentId): void {
  props.store.mutate(s => { changeGovernment(s, id); });
  afterAction();
}

function saveNow(done?: (success: boolean) => void): void {
  const success = props.store.runtime.save();
  props.store.refresh();
  done?.(success);
}

function startChallenges(genes: ChallengeGeneId[]): void {
  const result = launchChallenges(props.store.state(), genes, sampleEventInterval(Math.random), Date.now());
  if (!result) return;
  if (!replaceRun(result.next)) return;
  props.store.mutate(s => addLog(s, '挑战已启动，所选挑战基因在本周目生效。可通过设置中的软重置退出。', 'system'));
  worldView.value = 'home'; techView.value = 'available';
  props.store.refresh();
}

function resetRun(kind: 'soft' | 'hard', done?: (success: boolean) => void): void {
  let success = false;
  try { success = props.store.runtime.reset(kind); actionError.value = ''; }
  catch { actionError.value = '重置失败，请导出备份后重试。'; }
  if (success) { worldView.value = 'home'; techView.value = 'available'; factoryOpen.value = false; smelterOpen.value = false; synthesisOpen.value = false; shipModal.value = false; }
  props.store.refresh();
  done?.(success && !props.store.runtime.saveFailed);
}

function replaceState(next: GameState, done?: (loaded: boolean, saved?: boolean) => void): void {
  try {
    const saved = props.store.runtime.replaceState(next);
    if (!props.store.state().tech.includes('spaceflight')) worldView.value = 'home';
    props.store.refresh();
    done?.(true, saved);
  } catch {
    done?.(false);
  }
}

function manufacture(count: number): void {
  props.store.mutate(s => { createContainers(s, count); });
  afterAction();
}

function assignContainer(id: ResourceId, delta: number): void {
  props.store.mutate(s => {
    changeContainerAssignment(s, id, delta);
    clampResourcesToCaps(s, storageSnapshot(s));
  });
  afterAction();
}

function manufactureAlloy(count: number): void {
  props.store.mutate(s => { createAlloyContainers(s, count); });
  afterAction();
}

function assignAlloyContainer(id: ResourceId, delta: number): void {
  props.store.mutate(s => {
    changeAlloyContainerAssignment(s, id, delta);
    clampResourcesToCaps(s, storageSnapshot(s));
  });
  afterAction();
}

function investProject(id: string, percent: number): void {
  props.store.mutate(s => { investInProject(id, s, percent, Math.random); });
  afterAction();
}

function investShip(id: ShipComponentId, percent: number | 'max'): void {
  props.store.mutate(s => { investInShipComponent(id, percent, s); });
  afterAction();
}

function queueShip(id: ShipComponentId): void {
  props.store.mutate(s => { requestPurchaseModule(s, 'ship', id, () => moonSnapshot(s).available, true); });
  afterAction();
}

// Unlocked once held; the progression sync keeps them visible at 0 afterwards.
const prestigeVisible = computed(() => {
  props.store.revision();
  return { particles: isPrestigeResourceUnlocked(state.value, 'particles'), casimir: isPrestigeResourceUnlocked(state.value, 'casimir'), darkEnergy: isPrestigeResourceUnlocked(state.value, 'darkEnergy'), harmonyCrystals: isPrestigeResourceUnlocked(state.value, 'harmonyCrystals') };
});

function purchaseCrispr(id: CrisprUpgradeId): void {
  props.store.mutate(s => {
    if (purchaseCrisprUpgrade(s, id)) clampResourcesToCaps(s, storageSnapshot(s));
  });
  afterAction();
}

function queueProject(id: string, count: number): void {
  props.store.mutate(s => { enqueueProject(s, id, count); });
  afterAction();
}

function setTax(rate: number): void {
  props.store.mutate(s => { s.taxRate = Math.max(0, Math.min(30, Math.round(rate))); });
  afterAction();
}

function fillNuclear(percent: number): void {
  props.store.mutate(s => { fillNuclearProject(s, percent); });
  afterAction();
}

// Prestige resets run immediately on click; the trigger buttons carry a hover
// preview of the exact rewards instead of a confirmation dialog. SpaceshipModal
// keeps its modal open until the launch actually succeeds.
function launchShip(): void {
  confirmEscape();
}
function confirmEscape(): void {
  const result = launchEscapePrestige(props.store.state(), sampleEventInterval(Math.random), Date.now());
  if (!result) return;
  if (!replaceRun(result.next)) return;
  props.store.mutate(s => addLog(s, `ESS-喵星号已离开太阳系，获得 ${result.reward} 粒子与 ${result.casimirReward} 卡西米尔晶体。新的文明开始了。`, 'system'));
  shipModal.value = false;
  factoryOpen.value = false;
  smelterOpen.value = false;
  synthesisOpen.value = false;
  worldView.value = 'home';
  activeTab.value = 'buildings';
  techView.value = 'available';
  afterAction();
}

function confirmBlackHole(): void {
  const result = launchBlackHolePrestige(props.store.state(), sampleEventInterval(Math.random), Date.now());
  if (!result) return;
  if (!replaceRun(result.next)) return;
  props.store.mutate(s => addLog(s, `奇异失控引发了黑洞爆炸，一切归于虚无。获得 ${result.reward} 粒子、${result.casimirReward} 卡西米尔晶体与 ${result.darkEnergyReward} 暗能量。新的文明开始了。`, 'system'));
  shipModal.value = false;
  factoryOpen.value = false;
  smelterOpen.value = false;
  synthesisOpen.value = false;
  worldView.value = 'home';
  activeTab.value = 'buildings';
  techView.value = 'available';
  afterAction();
}
function changeEjection(id: ResourceId, delta: number): void {
  props.store.mutate(s => { changeEjectionAllocation(s, id, delta); });
  afterAction();
}

function confirmDigitalAscension(): void {
  const result = launchDigitalAscension(props.store.state(), sampleEventInterval(Math.random), Date.now());
  if (!result) return;
  if (!replaceRun(result.next)) return;
  props.store.mutate(s => addLog(s, `数字化飞升完成，获得 ${result.reward} 粒子、${result.casimirReward} 卡西米尔晶体与 ${result.harmonyReward} 和谐晶体。新的文明开始了。`, 'system'));
  shipModal.value = false;
  factoryOpen.value = false;
  smelterOpen.value = false;
  synthesisOpen.value = false;
  downloadOpen.value = false;
  worldView.value = 'home';
  activeTab.value = 'buildings';
  techView.value = 'available';
  afterAction();
}

function confirmNuclear(): void {
  const result = launchNuclearPrestige(props.store.state(), sampleEventInterval(Math.random), Date.now());
  if (!result) return;
  if (!replaceRun(result.next)) return;
  props.store.mutate(s => addLog(s, `核弹已发射，获得 ${result.reward} 粒子。新的文明开始了。`, 'system'));
  worldView.value = 'home';
  activeTab.value = 'buildings';
  afterAction();
}

const queuedItems = computed(() => { props.store.revision(); return describeQueuedPurchases(state.value); });
const queueTimes = computed(() => {
  props.store.revision();
  if (!state.value.queue.length) return new Map<number, string>();
  const caps = Object.fromEntries((Object.keys(RESOURCES) as ResourceId[]).map(id => [id, storageCap(id, state.value, props.store.revision())])) as ResourceAmounts;
  // Queue estimates use the live tick horizon so the countdown tracks the same
  // production the next settlement will actually pay, not a different step length.
  return estimateQueueTimes(state.value, uiPreview.production(state.value, props.store.revision(), CONFIG.uiStepSeconds).rates, caps);
});
const researchQueueItems = computed(() => queuedItems.value.filter(item => item.kind === 'tech'));
const buildingQueueItems = computed(() => queuedItems.value.filter(item => item.kind === 'build' || item.kind === 'arpa' || item.kind === 'mission' || item.kind === 'ship'));
function cancelQueue(uid: number): void {
  props.store.mutate(s => { removeQueuedPurchase(s, uid); });
  afterAction();
}
const factoryOpen = ref(false);
const factoryDialog = ref<HTMLDialogElement | null>(null);
const shipModal = ref(false);
const shipDialog = ref<HTMLDialogElement | null>(null);
watch(shipModal, async open => { if (open) { await nextTick(); shipDialog.value?.showModal(); } });

function dismissShipBackdrop(event: MouseEvent): void {
  const dialog = shipDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) shipModal.value = false;
}
watch(factoryOpen, async open => { if (open) { await nextTick(); factoryDialog.value?.showModal(); } });

function dismissFactoryBackdrop(event: MouseEvent): void {
  const dialog = factoryDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) factoryOpen.value = false;
}

function assignLine(id: string, delta: number): void {
  props.store.mutate(s => { changeFactoryAssignment(s, id, delta); });
  afterAction();
}

const smelterOpen = ref(false);
const smelterDialog = ref<HTMLDialogElement | null>(null);
watch(smelterOpen, async open => { if (open) { await nextTick(); smelterDialog.value?.showModal(); } });
function dismissSmelterBackdrop(event: MouseEvent): void {
  const dialog = smelterDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) smelterOpen.value = false;
}
function assignSmelter(delta: number): void {
  props.store.mutate(s => { changeSmelterAssignment(s, delta); });
  afterAction();
}

const synthesisOpen = ref(false);
const synthesisDialog = ref<HTMLDialogElement | null>(null);
watch(synthesisOpen, async open => { if (open) { await nextTick(); synthesisDialog.value?.showModal(); } });
function dismissSynthesisBackdrop(event: MouseEvent): void {
  const dialog = synthesisDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) synthesisOpen.value = false;
}
function setSynthesisRate(id: DnaId, value: number): void {
  props.store.mutate(s => { changeGeneSynthesisRate(s, id, value); });
  afterAction();
}

const downloadOpen = ref(false);
const downloadDialog = ref<HTMLDialogElement | null>(null);
watch(downloadOpen, async open => { if (open) { await nextTick(); downloadDialog.value?.showModal(); } });
watch(() => { props.store.revision(); return props.store.state().buildings.downloadExecutable > 0 && props.store.state().tech.includes('aiCoreCalibration'); }, available => { if (!available) downloadOpen.value = false; });
function dismissDownloadBackdrop(event: MouseEvent): void {
  const dialog = downloadDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) downloadOpen.value = false;
}
function setDownloadAllocation(value: number): void {
  props.store.mutate(s => changeDownloadAllocation(s, value));
  afterAction();
}

let timer: number | undefined;

onMounted(() => {
  props.store.refresh();
  timer = window.setInterval(() => {
    props.store.runtime.tick(CONFIG.uiStepSeconds);
    props.store.refresh();
  }, CONFIG.uiStepSeconds * 1000);
});

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer);
});
</script>

<template>
  <div class="app" :class="{ 'touch-optimized': state.settings.touchOptimization }">
    <header class="topbar">
      <div class="brand"><b>喵星旅人_world.execution(cat);</b><span>从登陆的第一只猫猫，到登陆月球</span></div>
      <span class="game-date">{{ gameDate }}</span>
      <div class="spacer"></div>
      <span class="small subtle" role="status">{{ saveStatus }}</span>
      <a class="update-log-link" href="./updatelog.html" target="_blank" rel="noopener" data-update-log-link>更新日志</a>
      <span class="small subtle" style="white-space:nowrap;color:#8bc77b;font-size:14px">beta 0.7.3</span>
    </header>

    <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
    <div class="layout">
      <aside class="col-left">
        <CivilizationPanel :state="state" :revision="store.revision()" />
        <ResourcePanel :state="state" :revision="store.revision()" />
        <CraftingPanel :state="state" :revision="store.revision()" @craft="(id, count) => { store.mutate(s => craftManually(s, id, count)); afterAction(); }" />
        <section v-if="prestigeVisible.particles || prestigeVisible.casimir || prestigeVisible.darkEnergy || prestigeVisible.harmonyCrystals" id="prestigeResources" class="panel">
          <div class="panel-head"><h2>威望资源</h2><span>跨周目保留</span></div>
          <div class="res-list">
            <div v-if="prestigeVisible.particles" class="res-row" data-prestige-row="particles">
              <span class="res-name">粒子</span>
              <span class="res-amount" tabindex="0" data-building-tip="particles" data-tip-kind="prestige" aria-label="查看粒子效果"><b>{{ state.prestige.particles }}</b></span>
            </div>
            <div v-if="prestigeVisible.casimir" class="res-row" data-prestige-row="casimir">
              <span class="res-name">卡西米尔晶体</span>
              <span class="res-amount" tabindex="0" data-building-tip="casimir" data-tip-kind="prestige" aria-label="查看卡西米尔晶体效果"><b>{{ state.prestige.casimir }}</b></span>
            </div>
            <div v-if="prestigeVisible.darkEnergy" class="res-row" data-prestige-row="darkEnergy">
              <span class="res-name">暗能量</span>
              <span class="res-amount" tabindex="0" data-building-tip="darkEnergy" data-tip-kind="prestige" aria-label="查看暗能量效果"><b>{{ state.prestige.darkEnergy }}</b></span>
            </div>
            <div v-if="prestigeVisible.harmonyCrystals" class="res-row" data-prestige-row="harmonyCrystals">
              <span class="res-name">和谐晶体</span>
              <span class="res-amount" tabindex="0" data-building-tip="harmonyCrystals" data-tip-kind="prestige" aria-label="查看和谐晶体效果"><b>{{ state.prestige.harmonyCrystals }}</b></span>
            </div>
          </div>
        </section>
      </aside>

      <main class="col-mid">
        <nav class="tabs" aria-label="游戏面板">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            :data-tab="tab.id"
            :class="{ active: activeTab === tab.id }"
            :hidden="(tab.id === 'arpa' && !state.tech.includes('arpa') && !state.tech.includes('genetics') && !state.tech.includes('crispr16') && !state.crispr.includes('challengeGene')) || (tab.id === 'resourceManagement' && !resourceManagementUnlocked)"
            @click="activeTab = tab.id"
          >{{ tab.label }}<span v-if="tab.id === 'story' && unreadStories" data-story-unread-count :aria-label="`${unreadStories}篇未读剧情`"> · {{ unreadStories }}</span></button>
        </nav>
        <section class="panel">
          <div class="content-body">
            <div v-if="activeTab === 'buildings'">
              <div class="world-buildings">
            <BuildingsPanel
              :state="state"
              :revision="store.revision()"
              :world-view="currentWorldView"
              @buy="buy"
              @toggle="toggle"
              @gather="gather"
              @factory-settings="factoryOpen = true"
              @smelter-settings="smelterOpen = true"
              @synthesis-settings="synthesisOpen = true"
              @ship-settings="shipModal = true"
               @download-settings="downloadOpen = true"
               @digital-ascension="confirmDigitalAscension"
              @world-view="worldView = $event"
              @mission="mission"
            />
              </div>
            </div>
            <TechPanel
              v-else-if="activeTab === 'tech'"
              :state="state"
              :revision="store.revision()"
              :tech-view="techView"
              @research="research"
              @tech-view="techView = $event"
            />
            <CatsPanel
              v-else-if="activeTab === 'cats'"
              :state="state"
              :revision="store.revision()"
              @assign="assignWorker"
              @craft="assignCraft"
              @auto-workers-enabled="changeAutoWorkersEnabled"
              @auto-worker-enabled="changeAutoWorkerEnabled"
              @auto-worker-limit="changeAutoWorkerLimit"
              @auto-worker-priority="changeAutoWorkerPriority"
              @auto-worker-order="changeAutoWorkerOrder"
            />
            <InternalPanel
              v-else-if="activeTab === 'internal'"
              :state="state"
              :revision="store.revision()"
              @reform="reform"
              @tax="setTax"
              @fill="fillNuclear"
              @nuclear="confirmNuclear"
            />
            <ArpaPanel
              v-else-if="activeTab === 'arpa'"
              :state="state"
              :revision="store.revision()"
              @invest="investProject"
              @queue="queueProject"
              @crispr-purchase="purchaseCrispr"
              @dna-craft="(id, count) => { store.mutate(s => craftDna(s, id, count)); afterAction(); }"
              @gene-upgrade="id => { store.mutate(s => upgradeGene(s, id)); afterAction(); }"
               @challenge-launch="startChallenges"
            />
            <StoryPanel v-else-if="activeTab === 'story'" :state="state" :revision="store.revision()" @read="readStory" />
            <div v-else-if="activeTab === 'statistics'">
              <nav class="tabs" aria-label="统计分类">
                <button :class="{ active: statisticsView === 'info' }" @click="statisticsView = 'info'">统计信息</button>
                <button :class="{ active: statisticsView === 'achievements' }" @click="statisticsView = 'achievements'">成就</button>
                <button data-statistics-view="perks" :class="{ active: statisticsView === 'perks' }" @click="statisticsView = 'perks'">特权</button>
              </nav>
              <StatsPanel
                v-if="statisticsView === 'info'"
                :state="state"
                :revision="store.revision()"
              />
              <PerksPanel
                v-else-if="statisticsView === 'perks'"
                :state="state"
                :revision="store.revision()"
              />
              <AchievementsPanel
                v-else
                :state="state"
                :revision="store.revision()"
              />
            </div>
            <SettingsPanel
              v-else-if="activeTab === 'settings'"
              :save-blocked="store.runtime.saveBlocked"
              :export-protected-save="store.runtime.exportProtectedSave"
              :state="state"
              :revision="store.revision()"
              @save="saveNow"
              @reset="resetRun"
              @replace="replaceState"
            />
            <ResourceManagementPanel
              v-else-if="activeTab === 'resourceManagement'"
              :state="state"
              :revision="store.revision()"
              @manufacture="manufacture"
              @assign="assignContainer"
              @manufacture-alloy="manufactureAlloy"
              @assign-alloy="assignAlloyContainer"
              @eject="changeEjection"
            />
            <TipsPanel
              v-else-if="activeTab === 'tips'"
              :state="state"
              :revision="store.revision()"
            />
            <p v-else class="empty">{{ TABS.find(t => t.id === activeTab)?.label }} 面板将在此处显示。</p>
          </div>
        </section>
      </main>

      <aside class="col-right">
        <section class="panel">
          <div class="panel-head"><h2>队列</h2><span>{{ state.queue.length ? `${state.queue.length} 项` : '空闲' }}</span></div>
          <div class="queue-body">
            <section class="queue-section">
              <div class="q-title">研究队列 <span>{{ researchQueueItems.length }}/{{ researchQueueCapacity(state) }}</span></div>
              <div v-if="!researchQueueItems.length" class="empty">暂无研究项目</div>
              <div class="q-grid">
                <div v-for="(item, i) in researchQueueItems" :key="item.uid" :data-queue-uid="item.uid" class="q-row" tabindex="0" :data-building-tip="item.id" :data-tip-kind="item.kind === 'build' ? 'building' : item.kind === 'tech' ? 'tech' : item.kind === 'mission' ? 'mission' : item.kind === 'ship' ? 'ship' : 'arpa'">
                  <div class="q-top"><span>{{ i + 1 }}. {{ item.name }}<template v-if="item.kind === 'build' && item.segments"> · 剩余 {{ item.segments }} 段</template></span><button class="tiny" :data-cancel-queue="item.uid" @click="cancelQueue(item.uid)">取消</button></div>
                  <div class="q-time" :data-queue-time="item.uid" title="按当前净产量估算；资源竞争、后续产量变化和手动操作可能改变完成时间。">{{ queueTimes.get(item.uid) }}</div>
                </div>
              </div>
            </section>
            <section class="queue-section">
              <div class="q-title">建筑队列（含 ARPA 项目、探索任务、飞船部件） <span>{{ buildingQueueUsage(state.queue) }}/{{ buildingQueueCapacity(state) }}</span></div>
              <div v-if="!buildingQueueItems.length" class="empty">暂无建筑项目</div>
              <div class="q-grid">
                <div v-for="(item, i) in buildingQueueItems" :key="item.uid" :data-queue-uid="item.uid" class="q-row" tabindex="0" :data-building-tip="item.id" :data-tip-kind="item.kind === 'build' ? 'building' : item.kind === 'tech' ? 'tech' : item.kind === 'mission' ? 'mission' : item.kind === 'ship' ? 'ship' : 'arpa'">
                  <div class="q-top"><span>{{ i + 1 }}. {{ item.name }}<template v-if="item.kind === 'build' && item.segments"> · 剩余 {{ item.segments }} 段</template></span><button class="tiny" :data-cancel-queue="item.uid" @click="cancelQueue(item.uid)">取消</button></div>
                  <div class="q-time" :data-queue-time="item.uid" title="按当前净产量估算；资源竞争、后续产量变化和手动操作可能改变完成时间。">{{ queueTimes.get(item.uid) }}</div>
                </div>
              </div>
            </section>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>日志记录</h2><div class="log-tools"><button id="clearLogs" @click="store.mutate(s => { s.logs = []; })">清空</button></div></div>
          <nav class="log-filters" aria-label="日志筛选"><button v-for="filter in logFilters" :key="filter.id" :class="{ active: logFilter === filter.id }" :data-log-filter="filter.id" :aria-pressed="logFilter === filter.id" @click="logFilter = filter.id">{{ filter.name }}</button></nav>
          <div class="logs">
            <div v-for="log in visibleLogs" :key="logKey(log)" class="log-line" :class="`t-${log.type}`">
              <time>{{ Math.floor(log.time / 60).toString().padStart(2, '0') }}:{{ Math.floor(log.time % 60).toString().padStart(2, '0') }}</time>
              {{ log.text }}
            </div>
          </div>
        </section>
      </aside>
    </div>

    <footer><span>{{ guide }}</span></footer>
    <TooltipPanel :state="state" :revision="store.revision()" />

    <dialog v-if="shipModal" ref="shipDialog" id="spaceshipModal" class="factory-modal spaceship-modal" aria-labelledby="spaceshipTitle" @cancel="shipModal = false" @click="dismissShipBackdrop">
      <div class="panel-head"><h2 id="spaceshipTitle">ESS-喵星号</h2><button aria-label="关闭飞船建造设置" @click="shipModal = false">关闭</button></div>
      <SpaceshipModal :state="state" :revision="store.revision()" @invest="investShip" @queue="queueShip" @launch="launchShip" />
    </dialog>
    <dialog v-if="downloadOpen" ref="downloadDialog" id="downloadModal" class="factory-modal" aria-labelledby="downloadTitle" @cancel="downloadOpen = false" @click="dismissDownloadBackdrop">
      <div class="panel-head"><h2 id="downloadTitle">dl.exe 配置</h2><button aria-label="关闭下载配置" @click="downloadOpen = false">关闭</button></div>
      <DownloadModal :state="state" :revision="store.revision()" @allocation="setDownloadAllocation" />
    </dialog>
    <dialog v-if="factoryOpen" ref="factoryDialog" id="factoryModal" class="factory-modal" @cancel="factoryOpen = false" @click="dismissFactoryBackdrop">
      <h2>工厂</h2>
      <FactoryModal
        :state="state"
        :revision="store.revision()"
        @assign="assignLine"
      />
    </dialog>
    <dialog v-if="smelterOpen" ref="smelterDialog" id="smelterModal" class="factory-modal" @cancel="smelterOpen = false" @click="dismissSmelterBackdrop">
      <h2>冶炼厂</h2>
      <SmelterModal
        :state="state"
        :revision="store.revision()"
        @assign="assignSmelter"
      />
    </dialog>
    <dialog v-if="synthesisOpen" ref="synthesisDialog" id="geneSynthesisModal" class="factory-modal" @cancel="synthesisOpen = false" @click="dismissSynthesisBackdrop">
      <h2>基因合成</h2>
      <GeneSynthesisModal :state="state" :revision="store.revision()" @rate="setSynthesisRate" />
    </dialog>
  </div>
</template>


