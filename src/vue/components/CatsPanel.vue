<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { CraftId } from '../../types/economy';
import { BUILDINGS } from '../../data/buildings';
import { RESOURCES, CRAFT_RECIPES } from '../../data/resources';
import { calculateWorkerCapacity, countUsedWorkers } from '../../simulation/building-production';
import { countCraftWorkers } from '../../simulation/crafting';
import { AUTO_WORKER_JOBS } from '../../simulation/auto-workers';
import { isResourceUnlocked } from '../../simulation/unlocks';
import { clickMultiplier, fmt, orderedCostEntries } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  assign: [id: BuildingId, delta: number];
  craft: [id: CraftId, delta: number];
  autoWorkersEnabled: [enabled: boolean];
  autoWorkerEnabled: [id: BuildingId, enabled: boolean];
  autoWorkerLimit: [id: BuildingId, limit: number];
  autoWorkerPriority: [sourceId: BuildingId, targetId: BuildingId];
  autoWorkerOrder: [priority: BuildingId[]];
}>();

// Use the command boundary's capabilities, not merely a positive building count:
// lumber and quarry are unlimited jobs even before their buildings are purchased.
const JOB_ORDER: BuildingId[] = ['forage', 'lumber', 'quarry', 'cementWorkshop', 'mine', 'coalMine', 'theater', 'school', 'lab', 'foundry', 'bank', 'asrielResidence'];
const WORK_BUILDINGS = (Object.keys(BUILDINGS) as BuildingId[]).filter(id => {
  const building = BUILDINGS[id];
  return id !== 'catCafe' && id !== 'planetaryFoundry' && (building.workerOutput || building.output || building.artistSlots || building.craftSlots);
}).sort((a, b) => {
  const rank = (id: BuildingId) => JOB_ORDER.includes(id) ? JOB_ORDER.indexOf(id) : JOB_ORDER.length;
  return rank(a) - rank(b);
});

const used = computed(() => { props.revision; return countUsedWorkers(props.state); });
const total = computed(() => { props.revision; return props.state.population; });
const rows = computed(() => {
  props.revision;
  return WORK_BUILDINGS.map(id => ({
    id,
    building: BUILDINGS[id],
    assigned: props.state.workers[id] || 0,
    cap: calculateWorkerCapacity(id, props.state),
    unlocked: props.state.tech.includes(BUILDINGS[id].tech) || (id === 'theater' && props.state.tech.includes(BUILDINGS.catCafe.tech)),
  })).filter(row => row.assigned > 0 || (row.unlocked && row.cap > 0));
});

const autoEnabled = computed(() => { props.revision; return props.state.autoWorkers?.enabled ?? false; });
const autoRows = computed(() => rows.value.filter(row => Number.isFinite(row.cap) && AUTO_WORKER_JOBS.includes(row.id)));
const dragPriority = ref<BuildingId[] | null>(null);
const priorityRows = computed(() => {
  props.revision;
  const priority = dragPriority.value ?? props.state.autoWorkers?.priority ?? AUTO_WORKER_JOBS;
  const order = [...priority, ...AUTO_WORKER_JOBS.filter(id => !priority.includes(id))];
  return order.flatMap(id => autoRows.value.filter(row => row.id === id && row.unlocked && row.cap > 0));
});
const draggedJob = ref<BuildingId | null>(null);
let lastDragTarget: BuildingId | null = null;
function isAutoJob(id: BuildingId): boolean {
  return autoRows.value.some(row => row.id === id);
}
function jobAutoEnabled(id: BuildingId): boolean {
  return props.state.autoWorkers?.jobs[id]?.enabled ?? false;
}
function jobAutoLimit(id: BuildingId): number {
  return props.state.autoWorkers?.jobs[id]?.limit ?? -1;
}
// Ticks re-render the rows while the user is typing or spinning; a draft keeps the
// focused field stable until the change event submits. A draft is dropped only when
// the committed limit changes elsewhere, so a tick never resets an in-flight edit.
const autoLimitDrafts = ref<Partial<Record<BuildingId, { value: number; base: number }>>>({});
watch(() => props.revision, () => {
  for (const id of Object.keys(autoLimitDrafts.value) as BuildingId[]) {
    const draft = autoLimitDrafts.value[id];
    if (draft && jobAutoLimit(id) !== draft.base) delete autoLimitDrafts.value[id];
  }
});
function autoLimitValue(id: BuildingId): number {
  const draft = autoLimitDrafts.value[id];
  return draft ? draft.value : jobAutoLimit(id);
}
function changeAutoLimit(id: BuildingId, event: Event): void {
  const input = event.target as HTMLInputElement;
  const limit = Number.isFinite(input.valueAsNumber) ? Math.min(1e9, Math.max(-1, Math.floor(input.valueAsNumber))) : autoLimitValue(id);
  delete autoLimitDrafts.value[id];
  input.value = String(limit);
  emit('autoWorkerLimit', id, limit);
}
function setAutoLimitDraft(id: BuildingId, event: Event): void {
  const input = event.target as HTMLInputElement;
  // Plain digits (or a leading minus) are accepted as they are typed; anything
  // unparseable snaps back to the last committed value instead of erasing it.
  const raw = input.value.trim();
  if (!/^-?\d*$/.test(raw)) { input.value = String(autoLimitValue(id)); return; }
  if (raw === '' || raw === '-') return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) { input.value = String(autoLimitValue(id)); return; }
  autoLimitDrafts.value[id] = { value: parsed > 1e9 ? 1e9 : Math.max(-1, Math.floor(parsed)), base: jobAutoLimit(id) };
}
function startPriorityDrag(id: BuildingId, event: DragEvent): void {
  draggedJob.value = id;
  dragPriority.value = [...props.state.autoWorkers.priority];
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}
function previewPriority(targetId: BuildingId, event: DragEvent): void {
  const sourceId = draggedJob.value;
  const order = dragPriority.value;
  if (!sourceId || !order || sourceId === targetId) { lastDragTarget = null; return; }
  if (lastDragTarget === targetId) return;
  lastDragTarget = targetId;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const sourceIndex = order.indexOf(sourceId), targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const next = [...order];
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceId);
  dragPriority.value = next;
}
function endPriorityDrag(): void {
  draggedJob.value = null;
  dragPriority.value = null;
  lastDragTarget = null;
}
function dropPriority(): void {
  if (draggedJob.value && dragPriority.value) emit('autoWorkerOrder', [...dragPriority.value]);
  endPriorityDrag();
}
function shiftPriority(index: number, delta: number): void {
  const row = priorityRows.value[index];
  const target = priorityRows.value[index + delta];
  if (row && target) {
    // The core inserts before the target; moving the next row up lowers this one.
    if (delta > 0) emit('autoWorkerPriority', target.id, row.id);
    else emit('autoWorkerPriority', row.id, target.id);
  }
}

function allocationClass(assigned: number, cap: number): string {
  if (!Number.isFinite(cap)) return 'is-unlimited';
  if (assigned <= 0) return 'is-empty';
  if (assigned >= cap) return 'is-full';
  const ratio = assigned / cap;
  return ratio < .25 ? 'is-low' : ratio <= .75 ? 'is-mid' : 'is-high';
}

const foundry = computed(() => { props.revision; return (props.state.buildings.foundry || 0) + (props.state.buildings.planetaryFoundry || 0); });
const foundryWorkers = computed(() => { props.revision; return props.state.workers.foundry || 0; });
const craftUsed = computed(() => { props.revision; return countCraftWorkers(props.state); });
const craftRows = computed(() => {
  props.revision;
  return (Object.keys(CRAFT_RECIPES) as CraftId[])
    .filter(id => isResourceUnlocked(id, props.state))
    .map(id => ({
      id,
      name: RESOURCES[id].name,
      assigned: props.state.craftWorkers[id] || 0,
      rate: CRAFT_RECIPES[id].rate,
      recipe: orderedCostEntries(CRAFT_RECIPES[id].input)
        .map(([resource, amount]) => `${RESOURCES[resource as keyof typeof RESOURCES].name} ${fmt(amount)}`).join(' + '),
    }));
});

</script>

<template>
  <div class="settings">
    <section>
      <h3>工作猫分配 <span class="subtle">{{ fmt(used) }} / {{ fmt(total) }} · 空闲 {{ fmt(Math.max(0, total - used)) }}</span></h3>
      <label class="auto-workers-master">
        <input type="checkbox" data-auto-workers-toggle :checked="autoEnabled" @change="emit('autoWorkersEnabled', ($event.target as HTMLInputElement).checked)">
        自动分配空闲猫
      </label>
      <p v-if="autoEnabled" class="small subtle auto-workers-help">仅补充空闲猫，不抢其他岗位。上限为该岗总在岗数，仅约束自动分配；-1 不限。</p>
      <div v-if="!rows.length" class="empty">尚无可用岗位，研究并建造生产建筑后可分配工作猫。</div>
      <div class="allocation-layout" :class="{ 'with-auto': autoEnabled }">
      <div class="job-list" :class="{ 'with-auto': autoEnabled }">
      <div v-for="row in rows" :key="row.id" class="craft-row workers">
        <span class="craft-name" :data-building-tip="row.id" data-tip-kind="job" tabindex="0">{{ row.building.workerName || (row.id === 'theater' ? '猫猫艺术家' : row.building.name) }}</span>
        <span class="worker-count" :class="allocationClass(row.assigned, row.cap)">{{ fmt(row.assigned) }} / {{ Number.isFinite(row.cap) ? fmt(row.cap) : '∞' }}</span>
        <span class="craft-actions">
          <button :data-worker="row.id" :data-delta="-1" :disabled="!row.unlocked || row.assigned <= 0" :aria-label="`撤回${row.building.name}工作猫`" @click="emit('assign', row.id, -clickMultiplier($event))">«</button>
          <button :data-worker="row.id" :data-delta="1" :disabled="!row.unlocked || used >= total || row.assigned >= row.cap" :aria-label="`分配${row.building.name}工作猫`" @click="emit('assign', row.id, clickMultiplier($event))">»</button>
        </span>
        <span v-if="autoEnabled && isAutoJob(row.id)" class="auto-worker-settings">
          <button :data-auto-worker="row.id" :aria-pressed="jobAutoEnabled(row.id)" :aria-label="`${row.building.name}自动分配`" @click="emit('autoWorkerEnabled', row.id, !jobAutoEnabled(row.id))">自动分配</button>
          <label>上限 <input type="number" min="-1" max="1000000000" step="1" :data-auto-worker-limit="row.id" :value="autoLimitValue(row.id)" :aria-label="`${row.building.name}自动分配上限，-1 不限`" @input="setAutoLimitDraft(row.id, $event)" @change="changeAutoLimit(row.id, $event)"></label>
        </span>
      </div>
      </div>
      <aside v-if="autoEnabled && priorityRows.length" class="auto-priority" aria-label="自动分配优先级" @dragover.prevent @drop.prevent="dropPriority">
        <strong>优先级</strong>
        <p class="small subtle">拖动排序，靠前优先。</p>
        <TransitionGroup tag="ol" name="priority">
          <li v-for="(row, index) in priorityRows" :key="row.id" :data-auto-priority="row.id" :class="{ 'is-dragging': draggedJob === row.id }" draggable="true" @dragstart="startPriorityDrag(row.id, $event)" @dragend="endPriorityDrag" @dragover.prevent="previewPriority(row.id, $event)">
            <span class="priority-name"><span aria-hidden="true">⠿</span> {{ row.building.workerName || (row.id === 'theater' ? '猫猫艺术家' : row.building.name) }}</span>
            <span class="priority-actions">
              <button :disabled="index === 0" :aria-label="`提高${row.building.name}优先级`" @click="shiftPriority(index, -1)">↑</button>
              <button :disabled="index === priorityRows.length - 1" :aria-label="`降低${row.building.name}优先级`" @click="shiftPriority(index, 1)">↓</button>
            </span>
          </li>
        </TransitionGroup>
      </aside>
      </div>
      <p class="small subtle">岗位分配受空闲猫口与岗位容量限制。伐木工人与石工在研究工具后即可分配，无需建造伐木场或采石场。Ctrl ×10、Shift ×25、Alt ×100，可组合相乘。</p>
    </section>

    <section v-if="foundry && craftRows.length" class="craft-management">
      <div class="craft-allocation">
        <strong>工匠分配</strong>
        <span>{{ fmt(craftUsed) }} / {{ fmt(foundryWorkers) }}</span>
        <span></span>
      </div>
      <div v-for="row in craftRows" :key="row.id" class="craft-allocation">
        <span :data-building-tip="row.id" data-tip-kind="craftJob" tabindex="0">{{ row.name }}</span>
        <span>{{ fmt(row.assigned) }}</span>
        <span>
          <button :data-craft-assign="row.id" :data-delta="-1" :disabled="row.assigned <= 0" :aria-label="`撤回${row.name}工匠`" @click="emit('craft', row.id, -clickMultiplier($event))">«</button>
          <button :data-craft-assign="row.id" :data-delta="1" :disabled="craftUsed >= foundryWorkers" :aria-label="`分配${row.name}工匠`" @click="emit('craft', row.id, clickMultiplier($event))">»</button>
        </span>
      </div>
      <p class="small subtle">先将工作猫分配到铸造厂，再分配制作种类。每位工匠按基础配方制作 0.1 份/s；产出应用粒子与铸造工具升级加成，不受幸福度和社区加成。</p>
    </section>
  </div>
</template>

<style scoped>
/* Keep job names anchored; retain 40% of the flexible gap before allocation controls. */
.job-list { display: grid; grid-template-columns: max-content minmax(0, 2fr) max-content max-content minmax(0, 3fr); column-gap: 4px; }
.workers { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; column-gap: 4px; }
.workers .craft-name { grid-column: 1; margin-right: 0; }
.workers .worker-count { grid-column: 3; }
.workers .craft-actions { grid-column: 4; flex-wrap: nowrap; }
.craft-allocation { grid-template-columns: minmax(max-content, 2fr) 65px 60px minmax(0, 3fr); }
.auto-workers-master { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px; cursor: pointer; }
.auto-workers-master input { width: auto; margin: 0; }
.auto-workers-help { margin-top: 0; }
.allocation-layout { overflow-x: auto; }
.allocation-layout.with-auto { display: grid; grid-template-columns: minmax(580px, 1fr) minmax(180px, 220px); gap: 20px; align-items: start; }
.job-list.with-auto { grid-template-columns: max-content minmax(20px, 2fr) max-content max-content max-content minmax(0, 1fr); }
.auto-worker-settings { grid-column: 5; display: inline-flex; align-items: center; gap: 8px; margin-left: 12px; padding-left: 12px; border-left: 1px solid currentColor; white-space: nowrap; }
.auto-worker-settings label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.auto-worker-settings input { width: 65px; min-width: 0; box-sizing: border-box; }
.auto-worker-settings button[aria-pressed="true"] { border-color: #63b875; }
.priority-move { transition: transform 160ms ease; }
.auto-priority li { transition: transform 160ms ease, opacity 160ms ease, background-color 160ms ease; }
.auto-priority li.is-dragging { opacity: .45; background-color: rgb(99 184 117 / 12%); }
@media (prefers-reduced-motion: reduce) {
  .priority-move, .auto-priority li { transition: none; }
}
.auto-priority { border-left: 1px solid currentColor; padding-left: 12px; font-size: 12px; }
.auto-priority p { margin: 4px 0 8px; }
.auto-priority ol { list-style: none; margin: 0; padding: 0; }
.auto-priority li { display: flex; justify-content: space-between; align-items: center; gap: 6px; min-height: 30px; cursor: grab; }
.priority-name { overflow-wrap: anywhere; }
.priority-actions { display: inline-flex; flex-shrink: 0; gap: 2px; }
.priority-actions button { padding: 1px 5px; min-width: 22px; }
@media (max-width: 760px) {
  .allocation-layout.with-auto { grid-template-columns: minmax(580px, 1fr) 180px; gap: 12px; }
}
</style>
