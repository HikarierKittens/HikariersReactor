<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { CraftId } from '../../types/economy';
import { BUILDINGS } from '../../data/buildings';
import { RESOURCES, CRAFT_RECIPES } from '../../data/resources';
import { calculateWorkerCapacity, countUsedWorkers } from '../../simulation/building-production';
import { countCraftWorkers } from '../../simulation/crafting';
import { isResourceUnlocked } from '../../simulation/unlocks';
import { clickMultiplier, fmt, orderedCostEntries } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  assign: [id: BuildingId, delta: number];
  craft: [id: CraftId, delta: number];
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
      <div v-if="!rows.length" class="empty">尚无可用岗位，研究并建造生产建筑后可分配工作猫。</div>
      <div class="job-list">
      <div v-for="row in rows" :key="row.id" class="craft-row workers">
        <span class="craft-name" :data-building-tip="row.id" data-tip-kind="job" tabindex="0">{{ row.building.workerName || (row.id === 'theater' ? '猫猫艺术家' : row.building.name) }}</span>
        <span class="worker-count" :class="allocationClass(row.assigned, row.cap)">{{ fmt(row.assigned) }} / {{ Number.isFinite(row.cap) ? fmt(row.cap) : '∞' }}</span>
        <span class="craft-actions">
          <button :data-worker="row.id" :data-delta="-1" :disabled="!row.unlocked || row.assigned <= 0" :aria-label="`撤回${row.building.name}工作猫`" @click="emit('assign', row.id, -clickMultiplier($event))">«</button>
          <button :data-worker="row.id" :data-delta="1" :disabled="!row.unlocked || used >= total || row.assigned >= row.cap" :aria-label="`分配${row.building.name}工作猫`" @click="emit('assign', row.id, clickMultiplier($event))">»</button>
        </span>
      </div>
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
</style>
