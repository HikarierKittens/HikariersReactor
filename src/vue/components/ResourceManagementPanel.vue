<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { calculateContainerCapacity, countAssignedContainers, isContainerAssignable, calculateContainerUnitCapacity, calculateContainerRecipe, calculateAlloyContainerCapacity, countAssignedAlloyContainers, calculateAlloyContainerUnitCapacity, ALLOY_CONTAINER_RECIPE } from '../../simulation/containers';
import { canPayCost } from '../../simulation/costs';
import { isResourceUnlocked } from '../../simulation/unlocks';
import { clickMultiplier, fmt, orderedCostEntries } from '../format';
import { uiPreview } from '../preview-cache';
import { calculateAllocatedEjection, calculateEjectedMassRate, calculateEjectionCapacity, ejectionMass, formatBlackHoleMass, isEjectableResource, isExoticResource } from '../../simulation/black-hole';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  manufacture: [count: number];
  assign: [id: ResourceId, delta: number];
  manufactureAlloy: [count: number];
  assignAlloy: [id: ResourceId, delta: number];
  eject: [id: ResourceId, delta: number];
}>();

const view = ref<'containers' | 'massEjection'>('containers');
const ejectionUnlocked = computed(() => { props.revision; return (props.state.buildings.massEjector || 0) > 0; });
const alloyUnlocked = computed(() => { props.revision; return props.state.tech.includes('superContainers'); });
const containersUnlocked = computed(() => { props.revision; return calculateContainerCapacity(props.state) > 0 || props.state.containers > 0 || calculateAlloyContainerCapacity(props.state) > 0 || props.state.alloyContainers > 0; });
watch([containersUnlocked, ejectionUnlocked], ([containers, ejection]) => {
  if (view.value === 'containers' && !containers && ejection) view.value = 'massEjection';
  else if (view.value === 'massEjection' && !ejection) view.value = 'containers';
}, { immediate: true });
const ejectionCapacity = computed(() => { props.revision; return calculateEjectionCapacity(props.state); });
const ejectionAllocated = computed(() => { props.revision; return calculateAllocatedEjection(props.state); });
const ejected = computed(() => { props.revision; return ejectionUnlocked.value ? uiPreview.production(props.state, props.revision).ejected : {}; });
const massRate = computed(() => calculateEjectedMassRate(ejected.value));
const ejectionRows = computed(() => {
  props.revision;
  return (Object.keys(RESOURCES) as ResourceId[])
    .filter(id => isEjectableResource(id) && isResourceUnlocked(id, props.state))
    .map(id => ({ id, definition: RESOURCES[id], rate: props.state.blackHole.ejection[id] || 0, actual: ejected.value[id] || 0, mass: ejectionMass(id), exotic: isExoticResource(id) }));
});
function mass(value: number): string { return value >= .001 || value === 0 ? formatBlackHoleMass(value) : value.toExponential(2); }

const capacity = computed(() => { props.revision; return calculateContainerCapacity(props.state); });
const owned = computed(() => { props.revision; return props.state.containers || 0; });
const assigned = computed(() => { props.revision; return countAssignedContainers(props.state); });
const unitCapacity = computed(() => { props.revision; return calculateContainerUnitCapacity(props.state); });
const recipe = computed(() => { props.revision; return calculateContainerRecipe(props.state); });
const recipeRows = computed(() => {
  props.revision;
  return orderedCostEntries(recipe.value).map(([resource, amount]) => `${RESOURCES[resource as ResourceId].name}: ${fmt(amount)}`);
});
const canManufacture = computed(() => {
  props.revision;
  return owned.value < capacity.value && canPayCost(props.state.resources, recipe.value)
    && (Object.keys(recipe.value) as ResourceId[]).every(resource => isResourceUnlocked(resource, props.state));
});
const rows = computed(() => {
  props.revision;
  return (Object.keys(RESOURCES) as ResourceId[])
    .filter(id => isContainerAssignable(id, props.state))
    .map(id => ({ id, definition: RESOURCES[id], count: props.state.containerAssignments[id] || 0 }));
});
const alloyCapacity = computed(() => { props.revision; return calculateAlloyContainerCapacity(props.state); });
const alloyOwned = computed(() => { props.revision; return props.state.alloyContainers || 0; });
const alloyAssigned = computed(() => { props.revision; return countAssignedAlloyContainers(props.state); });
const alloyUnitCapacity = computed(() => { props.revision; return calculateAlloyContainerUnitCapacity(props.state); });
const alloyRecipeText = orderedCostEntries(ALLOY_CONTAINER_RECIPE).map(([resource, amount]) => `${RESOURCES[resource as ResourceId].name}: ${fmt(amount)}`).join(' + ');
const canManufactureAlloy = computed(() => {
  props.revision;
  return alloyUnlocked.value && alloyOwned.value < alloyCapacity.value && canPayCost(props.state.resources, ALLOY_CONTAINER_RECIPE)
    && (Object.keys(ALLOY_CONTAINER_RECIPE) as ResourceId[]).every(resource => isResourceUnlocked(resource, props.state));
});
const alloyRows = computed(() => {
  props.revision;
  return rows.value.map(row => ({ ...row, count: props.state.alloyContainerAssignments[row.id] || 0 }));
});
</script>

<template>
  <nav class="tabs" aria-label="资源管理分类">
    <button v-if="containersUnlocked" data-resource-view="containers" :class="{ active: view === 'containers' }" :aria-pressed="view === 'containers'" @click="view = 'containers'">集装箱</button>
    <button v-if="ejectionUnlocked" data-resource-view="massEjection" :class="{ active: view === 'massEjection' }" :aria-pressed="view === 'massEjection'" @click="view = 'massEjection'">质量喷射</button>
  </nav>
  <template v-if="view === 'massEjection' && ejectionUnlocked">
    <div class="settings">
      <section>
        <p id="ejectionSummary">喷射容量 {{ fmt(ejectionAllocated) }} / {{ fmt(ejectionCapacity) }} /s · 空闲 {{ fmt(Math.max(0, ejectionCapacity - ejectionAllocated)) }} /s</p>
        <p>黑洞质量：<strong id="blackHoleMass">{{ formatBlackHoleMass(state.blackHole.mass) }}</strong> · 奇异质量：<strong id="blackHoleExoticMass">{{ formatBlackHoleMass(state.blackHole.exoticMass) }}</strong></p>
        <p class="small subtle">当前增长：质量 +{{ mass(massRate.mass) }}/s · 奇异质量 +{{ mass(massRate.exoticMass) }}/s</p>
        <p class="small subtle">每单位喷射容量每秒喷射1单位资源。质量喷射器需完整供电；电力不足时按供电比例减少喷射，库存不足时只喷射现有库存。分配支持 Ctrl ×10、Shift ×25、Alt ×100。</p>
      </section>
    </div>
    <div class="management-list">
      <article v-for="row in ejectionRows" :key="row.id" class="management-row" :data-eject-row="row.id">
        <h3 class="management-name">{{ row.definition.icon }} {{ row.definition.name }}</h3>
        <span class="management-note small subtle">每单位{{ row.exotic ? '奇异质量' : '质量' }} {{ mass(row.mass) }}</span>
        <div class="management-controls">
          <button :data-eject-resource="row.id" :data-delta="-1" :disabled="row.rate <= 0" :aria-label="`减少${row.definition.name}喷射`" @click="emit('eject', row.id, -10 * clickMultiplier($event))">−</button>
          <strong>{{ fmt(row.rate) }}/s</strong>
          <button :data-eject-resource="row.id" :data-delta="1" :disabled="ejectionAllocated >= ejectionCapacity" :aria-label="`增加${row.definition.name}喷射`" @click="emit('eject', row.id, 10 * clickMultiplier($event))">+</button>
          <span class="small subtle">实际 {{ fmt(row.actual) }}/s</span>
        </div>
      </article>
    </div>
  </template>
  <p v-else-if="!containersUnlocked" class="empty">建造提供集装箱上限的建筑后解锁。初始上限为0。</p>
  <div v-else-if="containersUnlocked" class="container-columns">
    <section class="container-column" aria-label="普通集装箱">
    <h3>普通集装箱</h3>
    <div class="settings">
      <section>
        <p id="containerSummary">已有 {{ fmt(owned) }} / {{ fmt(capacity) }} · 已分配 {{ fmt(assigned) }} · 空闲 {{ fmt(Math.max(0, owned - assigned)) }}</p>
        <p>单个集装箱当前提供储量：<strong id="containerUnit">{{ fmt(unitCapacity) }}</strong></p>
        <button id="manufactureContainers" :disabled="!canManufacture" @click="emit('manufacture', clickMultiplier($event))">制造集装箱 · {{ recipeRows.join(' + ') }}</button>
        <p class="small subtle">制造及分配支持 Ctrl ×10、Shift ×25、Alt ×100，可组合相乘。资源不足只制造可负担的数量。撤回不销毁集装箱；撤回后超出储量上限的资源立即丢失。</p>
      </section>
    </div>
    <div class="management-list">
      <article v-for="row in rows" :key="row.id" class="management-row" :data-container-row="row.id">
        <h3 class="management-name">{{ row.definition.icon }} {{ row.definition.name }}</h3>
        <div class="management-controls">
          <button :data-container-resource="row.id" :data-delta="-1" :disabled="row.count <= 0" :aria-label="`撤回${row.definition.name}集装箱`" @click="emit('assign', row.id, -clickMultiplier($event))">−</button>
          <strong>{{ fmt(row.count) }}</strong>
          <button :data-container-resource="row.id" :data-delta="1" :disabled="assigned >= owned" :aria-label="`分配${row.definition.name}集装箱`" @click="emit('assign', row.id, clickMultiplier($event))">+</button>
          <span class="small subtle">储量 +{{ fmt(row.count * unitCapacity) }}</span>
        </div>
      </article>
    </div>
    </section>
    <section v-if="alloyUnlocked" class="container-column" aria-label="合金集装箱">
      <h3>合金集装箱</h3>
      <div class="settings">
        <section>
          <p id="alloyContainerSummary">已有 {{ fmt(alloyOwned) }} / {{ fmt(alloyCapacity) }} · 已分配 {{ fmt(alloyAssigned) }} · 空闲 {{ fmt(Math.max(0, alloyOwned - alloyAssigned)) }}</p>
          <p>单个合金集装箱当前提供储量：<strong id="alloyContainerUnit">{{ fmt(alloyUnitCapacity) }}</strong></p>
          <button id="manufactureAlloyContainers" :disabled="!canManufactureAlloy" @click="emit('manufactureAlloy', clickMultiplier($event))">制造合金集装箱 · {{ alloyRecipeText }}</button>
          <p class="small subtle">独立制造与分配，每个提供普通集装箱4倍储量。支持相同批量快捷键；撤回后超出储量上限的资源立即丢失。</p>
        </section>
      </div>
      <div class="management-list">
        <article v-for="row in alloyRows" :key="row.id" class="management-row" :data-alloy-container-row="row.id">
          <h3 class="management-name">{{ row.definition.icon }} {{ row.definition.name }}</h3>
          <div class="management-controls">
            <button :data-alloy-container-resource="row.id" :data-delta="-1" :disabled="row.count <= 0" :aria-label="`撤回${row.definition.name}合金集装箱`" @click="emit('assignAlloy', row.id, -clickMultiplier($event))">−</button>
            <strong>{{ fmt(row.count) }}</strong>
            <button :data-alloy-container-resource="row.id" :data-delta="1" :disabled="alloyAssigned >= alloyOwned" :aria-label="`分配${row.definition.name}合金集装箱`" @click="emit('assignAlloy', row.id, clickMultiplier($event))">+</button>
            <span class="small subtle">储量 +{{ fmt(row.count * alloyUnitCapacity) }}</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.container-columns {
  display: flex;
  align-items: stretch;
  gap: 16px;
  max-width: 100%;
  overflow-x: auto;
}
.container-column {
  display: flex;
  flex: 1 0 420px;
  min-width: 420px;
  flex-direction: column;
}
.container-column > .settings { flex: 1; }
.container-column > .management-list { overflow-x: visible; }
.container-column .management-row { width: auto; }
.management-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-x: auto;
}
.management-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  min-width: 400px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 2px;
  white-space: nowrap;
}
.management-name {
  flex: 0 0 100px;
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}
.management-note { min-width: 180px; }
.management-controls {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.management-controls button {
  width: 26px;
  height: 26px;
  padding: 0;
  flex: 0 0 26px;
}
.management-controls strong { min-width: 48px; text-align: center; }
.management-controls > span { min-width: 105px; }
@media (max-width: 600px) {
  .management-row { gap: 6px; }
  .management-name { flex-basis: 80px; }
  .management-note { min-width: 160px; }
}
</style>
