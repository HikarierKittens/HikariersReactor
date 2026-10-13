<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { calculateContainerCapacity, countAssignedContainers, isContainerAssignable, calculateContainerUnitCapacity, calculateContainerRecipe } from '../../simulation/containers';
import { canPayCost } from '../../simulation/costs';
import { isResourceUnlocked } from '../../simulation/unlocks';
import { clickMultiplier, fmt, orderedCostEntries } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  manufacture: [count: number];
  assign: [id: ResourceId, delta: number];
}>();

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
</script>

<template>
  <nav class="tabs" aria-label="资源管理分类">
    <button class="active" aria-pressed="true">集装箱</button>
  </nav>
  <p v-if="!capacity && !owned" class="empty">建造提供集装箱上限的建筑后解锁。初始上限为0。</p>
  <template v-else>
    <div class="settings">
      <section>
        <p id="containerSummary">已有 {{ fmt(owned) }} / {{ fmt(capacity) }} · 已分配 {{ fmt(assigned) }} · 空闲 {{ fmt(Math.max(0, owned - assigned)) }}</p>
        <p>单个集装箱当前提供储量：<strong id="containerUnit">{{ fmt(unitCapacity) }}</strong></p>
        <button id="manufactureContainers" :disabled="!canManufacture" @click="emit('manufacture', clickMultiplier($event))">制造集装箱 · {{ recipeRows.join(' + ') }}</button>
        <p class="small subtle">制造及分配支持 Ctrl ×10、Shift ×25、Alt ×100，可组合相乘。资源不足只制造可负担的数量。撤回不销毁集装箱；撤回后超出储量上限的资源立即丢失。</p>
      </section>
    </div>
    <div class="detail-grid">
      <article v-for="row in rows" :key="row.id" class="card">
        <div class="card-top"><div class="card-title"><h3>{{ row.definition.icon }} {{ row.definition.name }}</h3></div></div>
        <div class="workers">
          <button :data-container-resource="row.id" :data-delta="-1" :disabled="row.count <= 0" :aria-label="`撤回${row.definition.name}集装箱`" @click="emit('assign', row.id, -clickMultiplier($event))">−</button>
          <strong>{{ fmt(row.count) }}</strong>
          <button :data-container-resource="row.id" :data-delta="1" :disabled="assigned >= owned" :aria-label="`分配${row.definition.name}集装箱`" @click="emit('assign', row.id, clickMultiplier($event))">+</button>
          <span class="small subtle">储量 +{{ fmt(row.count * unitCapacity) }}</span>
        </div>
      </article>
    </div>
  </template>
</template>
