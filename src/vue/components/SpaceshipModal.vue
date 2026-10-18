<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { SHIP_COMPONENTS, isShipComponentUnlocked, calculateShipComponentProgress, calculateShipComponentRemainingCost, type ShipComponentId } from '../../simulation/spaceship';
import { buildingQueueCapacity, buildingQueueUsage } from '../../simulation/queue-settings';
import { fmt, orderedCostEntries } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ invest: [id: ShipComponentId, percent: number | 'max']; queue: [id: ShipComponentId]; launch: [] }>();
const labels: Record<ShipComponentId, string> = { hull: '船体', energyCore: '能源核心', computer: '舰载计算机', ecosystem: '生态系统', electromagneticEngine: '电磁引擎', fuel: '装填能源' };
const rows = computed(() => {
  props.revision;
  const state = props.state;
  const laneCount = buildingQueueUsage(state.queue);
  return (['hull', 'energyCore', 'computer', 'ecosystem', 'electromagneticEngine', 'fuel'] satisfies ShipComponentId[]).map(id => {
    const definition = SHIP_COMPONENTS[id];
    const remaining = calculateShipComponentRemainingCost(id, state);
    const progress = calculateShipComponentProgress(id, state);
    const complete = !!state.shipComponents?.[id];
    const hullLocked = id !== 'hull' && !state.shipComponents?.hull;
    const unlocked = !hullLocked && isShipComponentUnlocked(id, state);
    const pending = state.queue.some(item => item.kind === 'ship' && item.id === id);
    const resources = orderedCostEntries(definition.cost).map(([resource, total]) => {
      const funded = Math.max(0, Math.min(100, state.shipResourceProgress?.[id]?.[resource as ResourceId] || 0));
      return { id: resource, name: RESOURCES[resource as ResourceId].name, total, funded, paid: total * funded / 100 };
    });
    if (definition.population) {
      const funded = Math.max(0, Math.min(100, state.shipResourceProgress?.[id]?.population || 0));
      resources.push({ id: 'population', name: '猫猫', total: definition.population, funded, paid: definition.population * funded / 100 });
    }
    const canInvest = Object.entries(remaining).some(([resource, amount]) => (amount || 0) > 0 && (resource === 'population' ? state.population >= 1 : state.resources[resource as ResourceId] > 0));
    return { id, name: labels[id], description: definition.desc, progress, complete, unlocked, hullLocked, pending, resources, canInvest,
      queueDisabled: complete || !unlocked || pending || state.queue.length >= 100 || laneCount >= buildingQueueCapacity(state) };
  });
});
const completedCount = computed(() => rows.value.filter(row => row.complete).length);
const displayPercent = (value: number) => Number(value.toFixed(2));
</script>

<template>
  <div id="spaceshipBody">
    <p class="ship-summary" role="status">{{ completedCount === 6 ? 'ESS-喵星号已完成' : `飞船部件：${completedCount} / 6 已完成` }}</p>
    <p class="ship-description">搭载了行星规模生态系统的超级飞船，船体长1859英里，或许可以带我们离开太阳系。</p>
    <div class="actions ship-launch-actions">
      <button v-if="completedCount === 6" id="launchSpaceship" class="primary" data-building-tip="escape" data-tip-kind="prestige-reset" @click="emit('launch')">发射ESS-喵星号</button>
    </div>
    <p class="small subtle">各项资源独立投入；1%、10%、100% 按总需求追加，资源不足时投入当前可用量。最大投入会填充所有可负担的剩余需求。</p>
    <div class="ship-sections">
      <section v-for="row in rows" :key="row.id" class="ship-section" :data-ship-component="row.id">
        <div class="ship-heading">
          <h3 tabindex="0" :data-building-tip="row.id" data-tip-kind="ship">{{ row.name }}</h3>
          <span :class="row.complete ? 'positive' : 'subtle'">{{ row.complete ? '已完成' : `${displayPercent(row.progress)}%` }}<template v-if="row.pending"> · 已加入队列</template></span>
        </div>
        <p v-if="row.description" class="small subtle">{{ row.description }}</p>
        <p v-if="row.hullLocked" class="small subtle">构建船体之前不可用</p>
        <div v-for="resource in row.resources" :key="resource.id" class="ship-resource" :data-ship-resource="resource.id">
          <div class="ship-resource-label"><span>{{ resource.name }}</span><span>{{ fmt(resource.paid) }} / {{ fmt(resource.total) }} · {{ displayPercent(resource.funded) }}%</span></div>
          <div class="q-bar" role="progressbar" :aria-label="`${row.name}${resource.name}投入进度`" :aria-valuenow="resource.funded" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${resource.funded}%` }"></i></div>
        </div>
        <div v-if="!row.complete" class="actions ship-actions">
          <button v-for="n in [1, 10, 100]" :key="n" :data-ship-invest="row.id" :data-percent="n" :disabled="!row.unlocked || row.pending || !row.canInvest" @click="emit('invest', row.id, n)">投入 {{ n }}%</button>
          <button :data-ship-invest="row.id" data-percent="max" :disabled="!row.unlocked || row.pending || !row.canInvest" @click="emit('invest', row.id, 'max')">最大投入</button>
          <button :data-ship-queue="row.id" :disabled="row.queueDisabled" @click="emit('queue', row.id)">加入队列</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ship-summary { font-weight: 700; margin: 12px 0; }
.ship-launch-actions { flex-wrap: wrap; }
.ship-sections { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
@media (max-width: 900px) { .ship-sections { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .ship-sections { grid-template-columns: minmax(0, 1fr); } }
.ship-section { background: var(--panel, #171d28); border: 1px solid var(--line, #666256); border-radius: 6px; padding: 14px; }
.ship-heading, .ship-resource-label { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.ship-heading h3 { margin: 0; font-size: 15px; }
.ship-resource { margin-top: 10px; }
.ship-resource-label { font-size: 12px; margin-bottom: 4px; flex-wrap: wrap; }
.ship-resource .q-bar { height: 4px; }
.ship-actions { margin-top: 14px; flex-wrap: wrap; }
</style>
