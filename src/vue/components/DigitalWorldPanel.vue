<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import { BUILDINGS } from '../../data/buildings';
import { calculateBuildingCost, canPayCost, isBuildingFullyBuilt } from '../../simulation/costs';
import { countRunningBuildings } from '../../simulation/housing';
import { hasContinuousEnergyInput } from '../../simulation/building-production';
import { buildingUnlocked, clickMultiplier, fmt } from '../format';
import { uiPreview } from '../preview-cache';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ buy: [id: BuildingId, count: number, forceQueue: boolean]; toggle: [id: BuildingId, delta: number]; configure: [] }>();
const digital = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).digital; });
const sections = computed(() => {
  props.revision;
  return [
    { id: 'ethernet', name: 'Ethernet', description: '这里是数字世界之间的连接', list: ['gatewayRouter', 'downloadExecutable'] as BuildingId[] },
    ...(props.state.tech.includes('binaryWorld') ? [{ id: 'interface', name: 'Interface', description: '连接万物的交互接口', list: ['quantumStorage', 'downloadCache'] as BuildingId[] }] : []),
  ].map(section => ({ ...section, list: section.list.filter(id => buildingUnlocked(id, props.state)) }));
});
const qHeld = ref(false);
function keyDown(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = true; }
function keyUp(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = false; }
function resetKey(): void { qHeld.value = false; }
function visibility(): void { if (document.hidden) resetKey(); }
onMounted(() => { window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', resetKey); document.addEventListener('visibilitychange', visibility); });
onUnmounted(() => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', resetKey); document.removeEventListener('visibilitychange', visibility); });
function queued(id: BuildingId): number { return props.state.queue.filter(item => item.kind === 'build' && item.id === id).length; }
function atLimit(id: BuildingId): boolean { return props.state.buildings[id] + queued(id) >= (BUILDINGS[id].max ?? Infinity); }
function affordable(id: BuildingId): boolean { return canPayCost(props.state.resources, calculateBuildingCost(id, props.state.buildings[id], props.state)); }
function running(id: BuildingId): number { return countRunningBuildings(id, props.state); }
function effective(id: BuildingId): number {
  const snapshot = digital.value;
  return id === 'gatewayRouter' ? snapshot.gatewayUnits : id === 'downloadExecutable' ? snapshot.downloadUnits : id === 'quantumStorage' ? snapshot.quantumStorageUnits : snapshot.cacheUnits;
}
function toggle(id: BuildingId, event: MouseEvent, start: boolean): void {
  const available = start ? props.state.buildings[id] - running(id) : running(id);
  emit('toggle', id, (start ? 1 : -1) * Math.min(clickMultiplier(event), available));
}
</script>

<template>
  <section v-for="section in sections" :key="section.id" class="building-group" :data-building-group="section.id">
    <h3 class="building-group-title">
      <span class="region-name" tabindex="0" :data-region-description="section.id" :aria-describedby="`digital-region-tip-${section.id}`">{{ section.name }}<span :id="`digital-region-tip-${section.id}`" class="region-description" role="tooltip">{{ section.description }}</span></span>
      <span v-if="section.id === 'ethernet'" class="digital-bandwidth" data-digital-bandwidth :aria-label="`带宽使用 ${fmt(digital.used)} / ${fmt(digital.capacity)}`">{{ fmt(digital.used) }} / {{ fmt(digital.capacity) }}</span>
    </h3>
    <div class="building-grid">
      <div v-for="id in section.list" :key="id" class="building-control">
        <button class="building-button" :class="{ 'is-complete': isBuildingFullyBuilt(id, state), 'is-affordable': isBuildingFullyBuilt(id, state) || (affordable(id) && !atLimit(id)), 'is-unaffordable': !isBuildingFullyBuilt(id, state) && (!affordable(id) || atLimit(id)) }" :data-buy="id" :data-building-tip="id" data-tip-kind="building" :aria-disabled="atLimit(id)" :aria-label="`${BUILDINGS[id].name}，已有 ${state.buildings[id]} 座`" @click="!atLimit(id) && emit('buy', id, clickMultiplier($event), !!(state.settings.queueHotkeys && (qHeld || $event.shiftKey)))">
          <span class="building-name">{{ BUILDINGS[id].name }}</span><span class="building-count" aria-hidden="true">{{ state.buildings[id] }}</span><span v-if="queued(id)" class="building-pending">预约 {{ queued(id) }}</span>
        </button>
        <button class="building-info" :data-building-tip="id" data-tip-kind="building" :aria-label="`查看${BUILDINGS[id].name}详情`">ⓘ</button>
        <button v-if="id === 'downloadExecutable' && state.buildings[id] > 0" class="building-gear" data-download-settings aria-label="配置 dl.exe 下载分配" title="下载分配设置" @click="emit('configure')">⚙</button>
        <template v-if="state.buildings[id] > 0 && hasContinuousEnergyInput(id, state)">
          <button class="building-toggle stop" :aria-label="`关停一座${BUILDINGS[id].name}`" :disabled="running(id) === 0" @click="toggle(id, $event, false)">{{ state.buildings[id] - running(id) }}</button>
          <button class="building-toggle start" :class="{ 'is-shortage': effective(id) + 1e-9 < running(id) }" :aria-label="`启动一座${BUILDINGS[id].name}`" :disabled="running(id) === state.buildings[id]" @click="toggle(id, $event, true)">{{ running(id) }}</button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.region-name { position: relative; cursor: help; border-bottom: 1px dotted var(--muted); }
.region-description { display: none; position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); width: min(380px, 75vw); padding: 12px 14px; border: 1px solid var(--line); border-radius: 5px; background: #1d1e1b; color: var(--text); font-size: 12px; font-weight: 400; line-height: 1.8; box-shadow: 0 6px 18px #0006; pointer-events: none; }
.region-name:hover .region-description, .region-name:focus .region-description { display: block; }
.region-name:focus-visible { outline: 1px solid var(--gold); outline-offset: 3px; }
.digital-bandwidth { color: var(--green); font-variant-numeric: tabular-nums; margin-left: auto; }
</style>
