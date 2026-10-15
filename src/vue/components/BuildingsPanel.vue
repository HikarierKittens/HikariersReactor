<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { regionBalanceBind, regionBalanceText } from './region-balance';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import { BUILDINGS, BUILDING_GROUPS } from '../../data/buildings';
import { RESOURCES } from '../../data/resources';
import { calculateBuildingCost, canPayCost, isBuildingFullyBuilt } from '../../simulation/costs';
import { hasContinuousEnergyInput, calculateBuildingName } from '../../simulation/building-production';
import { countRunningBuildings } from '../../simulation/housing';
import { calculateQuantumLevel, calculateSwarmSupportCapacity } from '../../simulation/quantum';
import { floorWithPrecision } from '../../shared/format';
import { REGIONAL_MISSIONS, calculateRegionalMissionCost, isRegionalMissionAvailable, isRegionalMissionCompleted, type RegionalMissionId, type SpaceMissionId } from '../../simulation/space-missions';
import { uiPreview } from '../preview-cache';
import { isHyperspaceUnlocked } from '../../simulation/stage-three';
import { isBuildingUnderworking } from '../building-status';
import { isGeneSynthesisUnlocked } from '../../simulation/genes';
import { fmt, buildingUnlocked, orderedCostEntries, moonSnapshot, clickMultiplier } from '../format';

const qHeld = ref(false);
function onKeyDown(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = true; }
function onKeyUp(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = false; }
function resetQueueHotkey(): void { qHeld.value = false; }
function onVisibilityChange(): void { if (document.hidden) resetQueueHotkey(); }
onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', resetQueueHotkey);
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', resetQueueHotkey);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

const props = defineProps<{ state: GameState; revision: number; worldView: string }>();
const emit = defineEmits<{
  buy: [id: BuildingId, count: number, forceQueue: boolean];
  toggle: [id: BuildingId, delta: number];
  gather: [id: 'food' | 'wood' | 'stone'];
  factorySettings: [id: BuildingId];
  smelterSettings: [];
  synthesisSettings: [];
  shipSettings: [];
  worldView: [view: string];
  mission: [id: RegionalMissionId, forceQueue: boolean];
}>();

const SPACE = ['touristStation', 'solarSatellite', 'researchSatellite', 'orbitalFuelDepot', 'navigationBeacon'] satisfies BuildingId[];
const MOON = ['moonBase', 'iridiumMine', 'helium3Mine', 'moonObservatory'] satisfies BuildingId[];
const ASRIEL = ['asrielSpaceport', 'asrielControlTower', 'asrielResidence', 'asrielMine', 'ecologicalDome', 'hangar', 'spaceFactory', 'starRingStation', 'planetaryFoundry', 'spaceGarrison', 'alienMaterialLab', 'vrCenter'] satisfies BuildingId[];

const NEW_SPACE_GROUPS: { id: SpaceMissionId; name: string; list: BuildingId[] }[] = [
  { id: 'solar', name: '太阳', list: ['swarmControlStation', 'swarmSatellite', 'swarmFactory'] },
  { id: 'talos', name: '塔罗斯', list: ['atmosphericCollector', 'galacticFuelDepot'] },
  { id: 'talosMoon', name: '塔卫二', list: ['talosMoonMiningStation', 'miningDrone', 'oilExtractor', 'aiSupercore'] },
  { id: 'asteroidBelt', name: '小行星带', list: ['iridiumMiningShip', 'ironMiningShip', 'e710MiningShip', 'e710Container'] },
  { id: 'misen', name: '米神星', list: ['e710Warehouse', 'e710Reactor', 'interstellarDock'] },
];
const SPACE_IDS = new Set<BuildingId>([...SPACE, ...MOON, ...ASRIEL, 'constraintArray', 'signalRepeater', 'shortRangeRelay', 'anchorFreightStation', 'civilianRouteStation', 'hyperspaceSpaceport', 'iceMiningShip', 'asteroidBase', 'hydrogenPowerPlant', 'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip', 'spaceRipper', 'highTechFactory', 'e710ResearchStation', 'geothermalPlant', 'adamantiteMiningShip', 'adamantiteProcessor', 'grapheneFactory', 'stellarForge', 'blackHoleStation', 'penroseSphere', ...NEW_SPACE_GROUPS.flatMap(group => group.list)]);
function missionId(id: string): RegionalMissionId | undefined {
  return Object.hasOwn(REGIONAL_MISSIONS, id) ? id as RegionalMissionId : undefined;
}
function visibleMission(id: string): RegionalMissionId | undefined {
  const mission = missionId(id);
  return mission && isRegionalMissionAvailable(props.state, mission) && !isRegionalMissionCompleted(props.state, mission) ? mission : undefined;
}
function missionQueued(id: RegionalMissionId): boolean {
  return props.state.queue.some(item => item.kind === 'mission' && item.id === id);
}
function missionAffordable(id: RegionalMissionId): boolean {
  return canPayCost(props.state.resources, calculateRegionalMissionCost(props.state, id));
}

const hyperspaceUnlocked = computed(() => { props.revision; return isHyperspaceUnlocked(props.state); });
const sections = computed(() => {
  props.revision;
  if (props.worldView === 'hyperspace') {
    if (!hyperspaceUnlocked.value) return [];
    const regions: { id: string; name: string; list: BuildingId[] }[] = [{ id: 'anomaly', name: '空间异常·接入点', list: (['constraintArray', 'signalRepeater', 'shortRangeRelay', 'anchorFreightStation', 'civilianRouteStation'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) }];
    if (props.state.tech.includes('dimensionBeaconDeployment')) regions.push(
      { id: 'hyperspaceStable', name: '空间异常·稳定区域', list: (['hyperspaceSpaceport', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
      ...(props.state.tech.includes('hyperspaceMiningSurvey') ? [{ id: 'e710Enrichment', name: '710富集区', list: (['comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFactory', 'e710ResearchStation'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) }] : []),
      { id: 'eruptingAsteroids', name: '喷发小行星群', list: (['iceMiningShip', 'asteroidBase', 'hydrogenPowerPlant'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
      { id: 'dimensionalBoundary', name: '维度边界', list: (['spaceRipper'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
    );
    // 超频-13 opens the black-hole regions below 维度边界; 能量护盾 opens the two mission regions.
    if (props.state.tech.includes('overclocking13')) regions.push({ id: 'alphaSector', name: '天元六alpha星区', list: (['adamantiteMiningShip', 'adamantiteProcessor', 'grapheneFactory'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) });
    if (props.state.tech.includes('energyShield')) regions.push(
      { id: 'neutronStar', name: '卡尔维拉', list: (['stellarForge'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
      { id: 'blackHole', name: 'DSR-8086', list: (['blackHoleStation', 'penroseSphere', 'massEjector'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
    );
    return regions.filter(section => section.list.length || ['dimensionalBoundary', 'alphaSector', 'neutronStar', 'blackHole'].includes(section.id));
  }
  if (props.worldView === 'space') {
    return [
      { id: 'eden', name: 'Eden_Kittens', list: SPACE.filter(id => buildingUnlocked(id, props.state)) },
      { id: 'moon', name: '月球', list: MOON.filter(id => buildingUnlocked(id, props.state)) },
      { id: 'asriel', name: 'Asriel', list: ASRIEL.filter(id => buildingUnlocked(id, props.state)) },
      { id: 'kerberos', name: 'Kerberos', list: (['geothermalPlant'] satisfies BuildingId[]).filter(id => buildingUnlocked(id, props.state)) },
      ...NEW_SPACE_GROUPS.filter(group => isRegionalMissionAvailable(props.state, group.id)).map(group => ({ ...group, list: group.list.filter(id => buildingUnlocked(id, props.state)) })),
    ].filter(section => section.list.length || NEW_SPACE_GROUPS.some(group => group.id === section.id) || (['asriel', 'kerberos'].includes(section.id) && props.state.tech.includes('planetaryExploration')));
  }
  return BUILDING_GROUPS.map(group => ({
    id: group.id,
    name: group.name,
    list: group.buildings.filter(id => !SPACE_IDS.has(id) && buildingUnlocked(id, props.state)),
  })).filter(section => section.list.length);
});

/** Live lunar support balance, from the same allocation the settlement tick uses. */
const REGION_DESCRIPTIONS: Record<string, string> = {
  e710Enrichment: '发现大量小行星体，检测到高浓度710元素',
  hyperspaceStable: '距离接入点估算16AU，这里是异常空间里时空波动最小的区域之一',
  eruptingAsteroids: '在距离接入点约230AU的地方发现了热能波动，这里有一群奇怪的小行星正在"喷发火山"',
  dimensionalBoundary: '与接入点无法测算，看起来这是超空间与另一处正常空间的交界点',
  alphaSector: '黑洞附近的可怜星系，大部分星区被破坏了，只剩下一些残余',
  neutronStar: '中子星卡维尔拉，编号NTR-1145, 它居然位于黑洞的吸积盘附近并且屹立不倒，真神奇',
  blackHole: '一颗人造黑洞，空间撕裂所致，也许我们不该滥用维度技术的',
  eden: '一颗蓝色的大质量类地行星，但是它的重力低于预期，原因不明',
  moon: '荒芜的岩石星球，上面发现了稀有金属和氦同位素，月球背面很适合建造天文站',
  asriel: '富含金属矿的红色行星，适合建立地面与轨道定居点',
  kerberos: '奇怪的岩石星球，有超乎寻常的大内核，富含硅质矿物，白昼面极热',
  solar: '一颗蓝色的大家伙恒星，听说质量有20个标准G3V型恒星那么大！',
  talos: '氢气与氦气的世界，想用猫爪摸摸',
  talosMoon: '一颗奇异的类地卫星，上面检测到了中子物质与极高有机物指数，疑似存在碳氢化合物矿藏',
  asteroidBelt: '小行星带的矿藏价值极高，可惜喵星人不喜欢黄金，只能去挖铁和铱.......\n警告：侦测到空间异常，疑似存在奇异物质活动......它们是活的！',
  misen: '一颗看起来平平无奇的矮行星，适合拿去建造特殊设施与轨道工程，\n第一位发现它的天文学家将其标记为代号AES-1859, 他说那是幸运数字',
  anomaly: '经过反复观测与验证后，AI超级核心在太阳系的荒芜星域发现了一些细微的空间曲率异常，\n也许可以尝试放大且稳定它们，甚至往里面丢东西！',
};
const hyperspaceBalance = computed(() => { props.revision; return uiPreview.support(props.state, props.revision).stageThree; });
const moonBalance = computed(() => { props.revision; return moonSnapshot(props.state, 1, props.revision); });
const asrielBalance = computed(() => { props.revision; return uiPreview.support(props.state, props.revision).asriel; });
const quantumLevel = computed(() => { props.revision; return calculateQuantumLevel(props.state); });
function quantumText(value: number): string { return (floorWithPrecision(value * 100) / 100).toFixed(2); }
const swarmBalance = computed(() => {
  props.revision;
  const capacity = calculateSwarmSupportCapacity(props.state);
  return { capacity, used: Math.min(capacity, countRunningBuildings('swarmSatellite', props.state)) };
});

const operationalSnapshot = computed(() => { props.revision; return uiPreview.production(props.state, props.revision); });
function underworking(id: BuildingId): boolean {
  return isBuildingUnderworking(id, props.state, operationalSnapshot.value);
}

function buildingCount(id: BuildingId): number {
  return props.state.buildings[id] || 0;
}
function completedCount(id: BuildingId): number {
  return Math.floor(buildingCount(id) / (BUILDINGS[id].segmentedRequired ?? 1));
}
function countLabel(id: BuildingId): string {
  const required = BUILDINGS[id].segmentedRequired;
  return required ? String(buildingCount(id) < required ? buildingCount(id) : completedCount(id)) : String(buildingCount(id));
}
function runningCount(id: BuildingId): number {
  return countRunningBuildings(id, props.state);
}
function toggleDelta(id: BuildingId, event: MouseEvent, start: boolean): number {
  const available = start ? completedCount(id) - runningCount(id) : runningCount(id);
  return (start ? 1 : -1) * Math.min(clickMultiplier(event), available);
}
function queuedCount(id: BuildingId): number {
  return props.state.queue.reduce((sum, q) => sum + (q.kind === 'build' && q.id === id ? (q.segments ?? 1) : 0), 0);
}
function atLimit(id: BuildingId): boolean {
  return buildingCount(id) + queuedCount(id) >= (BUILDINGS[id].segmentedRequired ?? BUILDINGS[id].max ?? Infinity);
}
function toggleable(id: BuildingId): boolean {
  return completedCount(id) > 0 && hasContinuousEnergyInput(id, props.state);
}
function cost(id: BuildingId): Record<string, number> | null {
  // Once-only buildings (and completed segmented projects) no longer quote prices.
  if (isBuildingFullyBuilt(id, props.state)) return null;
  return calculateBuildingCost(id, buildingCount(id), props.state);
}
function affordable(id: BuildingId): boolean {
  const price = cost(id);
  return price !== null && canPayCost(props.state.resources, price);
}
function costRows(id: BuildingId) {
  const price = cost(id);
  return price === null ? [] : orderedCostEntries(price).map(([r, n]) => ({
    id: r,
    name: RESOURCES[r as keyof typeof RESOURCES].name,
    amount: n,
    enough: props.state.resources[r as keyof typeof props.state.resources] >= n,
  }));
}
function outputText(id: BuildingId): string {
  const b = BUILDINGS[id];
  const entries = Object.entries(b.output || {}) as [string, number][];
  if (!entries.length || id === 'smelter') return '';
  return entries.map(([r, v]) =>
    `${RESOURCES[r as keyof typeof RESOURCES].icon} ${fmt(v * runningCount(id))}/s`).join(' ');
}
function toggleLabel(id: BuildingId): boolean {
  return ['cementWorkshop', 'mine', 'coalMine', 'lumber', 'quarry', 'metalRefinery'].includes(id);
}
function canGather(id: string): boolean {
  return props.state.clicks >= 0 && props.worldView === 'home';
}
</script>

<template>

  <nav class="tabs" aria-label="世界区域">
    <button data-world-view="home" :class="{ active: worldView === 'home' }" @click="emit('worldView', 'home')">地面</button>
    <button v-if="state.tech.includes('spaceflight')" data-world-view="space" :class="{ active: worldView === 'space' }" @click="emit('worldView', 'space')">太空</button>
    <button v-if="hyperspaceUnlocked" data-world-view="hyperspace" :class="{ active: worldView === 'hyperspace' }" @click="emit('worldView', 'hyperspace')">{{ state.tech.includes('overclocking13') ? '遥远星际' : '超空间' }}</button>
  </nav>
  <template v-if="worldView === 'home'">
    <section class="building-group">
      <h3 class="building-group-title">杂项</h3>
      <div class="manual-gather" id="orbit">
        <button
          v-for="r in (['food', 'wood', 'stone'] as const)"
          :key="r"
          :data-gather="r"
          :hidden="!canGather(r)"
          :aria-label="`采集${RESOURCES[r].name}`"
          @click="emit('gather', r)"
        >{{ RESOURCES[r].icon }} 采集{{ RESOURCES[r].name }}</button>
      </div>
    </section>
  </template>

  <section v-for="section in sections" :key="section.id" class="building-group" :data-building-group="section.id">
    <h3 class="building-group-title">
      <span v-if="worldView !== 'home' && REGION_DESCRIPTIONS[section.id]" class="region-name" tabindex="0" :data-region-description="section.id" :aria-describedby="`region-tip-${section.id}`">
        {{ section.name }}
        <span class="region-description" role="tooltip" :id="`region-tip-${section.id}`">{{ REGION_DESCRIPTIONS[section.id] }}</span>
      </span>
      <span v-else>{{ section.name }}</span>
      <span v-if="section.id === 'anomaly'" v-bind="regionBalanceBind(hyperspaceBalance, '超空间稳定度')" data-hyperspace-balance>{{ regionBalanceText(hyperspaceBalance) }}</span>
      <span v-else-if="section.id === 'eruptingAsteroids'" v-bind="regionBalanceBind(hyperspaceBalance, '喷发小行星群支持')" data-asteroid-support-balance>{{ regionBalanceText({ used: hyperspaceBalance.asteroidUsed, capacity: hyperspaceBalance.asteroidCapacity }) }}</span>
      <span v-else-if="section.id === 'moon'" v-bind="regionBalanceBind(moonBalance, '月球支持')" id="moonSupportBalance">{{ regionBalanceText(moonBalance) }}</span>
      <span v-else-if="section.id === 'asriel'" v-bind="regionBalanceBind(asrielBalance, 'Asriel支持')" id="asrielSupportBalance">{{ regionBalanceText(asrielBalance) }}</span>
      <span v-else-if="section.id === 'solar'" v-bind="regionBalanceBind(swarmBalance, '戴森群支持')" id="swarmSupportBalance">{{ regionBalanceText(swarmBalance) }}</span>
    </h3>
    <div class="building-grid">
      <template v-for="mission in [visibleMission(section.id)]" :key="mission">
        <div v-if="mission" class="building-control" :data-space-mission="mission">
          <button
            :id="`launch${mission.charAt(0).toUpperCase() + mission.slice(1)}Mission`"
            class="building-button"
            :class="missionAffordable(mission) && !missionQueued(mission) ? 'is-affordable' : 'is-unaffordable'"
            :data-building-tip="mission" data-tip-kind="mission"
            :disabled="missionQueued(mission)"
            :aria-label="REGIONAL_MISSIONS[mission].name"
            @click="emit('mission', mission, !!(state.settings.queueHotkeys && (qHeld || ($event as MouseEvent).shiftKey)))"
            @contextmenu.prevent="!missionQueued(mission) && emit('mission', mission, true)"
          >
            <span class="building-name">{{ REGIONAL_MISSIONS[mission].name }}</span>
            <span class="building-pending" :hidden="!missionQueued(mission)">预约 1</span>
          </button>
          <button class="building-info" :data-building-tip="mission" data-tip-kind="mission" :aria-label="`查看${REGIONAL_MISSIONS[mission].name}详情`">ⓘ</button>
        </div>
      </template>
      <div v-for="id in section.list" :key="id" class="building-control">
        <button
          class="building-button"
          :class="{ 'is-complete': isBuildingFullyBuilt(id, state), 'is-affordable': isBuildingFullyBuilt(id, state) || (affordable(id) && !atLimit(id)), 'is-unaffordable': !isBuildingFullyBuilt(id, state) && (!affordable(id) || atLimit(id)) }"
          :data-buy="id"
          :data-building-tip="id" data-tip-kind="building"
          :aria-disabled="atLimit(id)"
          :aria-label="`${calculateBuildingName(id, state)}，${BUILDINGS[id].segmentedRequired ? countLabel(id) : `已有 ${buildingCount(id)} 座`}`"
          @click="!atLimit(id) && emit('buy', id, clickMultiplier($event), !!(state.settings.queueHotkeys && (qHeld || ($event as MouseEvent).shiftKey)))"
        >
          <span class="building-name">{{ calculateBuildingName(id, state) }}</span>
          <span class="building-count" aria-hidden="true">{{ countLabel(id) }}</span>
          <span class="building-pending" :hidden="!queuedCount(id)">预约 {{ queuedCount(id) }}{{ BUILDINGS[id].segmentedRequired ? ' 段' : '' }}</span>
        </button>

        <button class="building-info" :data-building-tip="id" data-tip-kind="building" :aria-label="`查看${calculateBuildingName(id, state)}详情`">ⓘ</button>
        <button
          v-if="BUILDINGS[id].lines"
          class="building-gear"
          :aria-label="`${calculateBuildingName(id, state)}生产线设置`"
          title="生产线设置"
          @click="emit('factorySettings', id)"
        >⚙</button>
        <button
          v-if="(id === 'smelter' || id === 'stellarForge') && buildingCount(id) > 0"
          class="building-gear"
          data-smelter-settings
          aria-label="冶炼厂工位设置"
          title="冶炼厂工位设置"
          @click="emit('smelterSettings')"
        >⚙</button>
        <button
          v-if="id === 'biologyLab' && buildingCount(id) > 0 && isGeneSynthesisUnlocked(state)"
          class="building-gear"
          data-synthesis-settings
          aria-label="基因合成设置"
          title="基因合成设置"
          @click="emit('synthesisSettings')"
        >⚙</button>

        <button
          v-if="id === 'interstellarDock' && buildingCount(id) > 0"
          class="building-gear"
          data-ship-settings
          aria-label="ESS-喵星号建造设置"
          title="ESS-喵星号建造设置"
          @click="emit('shipSettings')"
        >⚙</button>

        <template v-if="toggleable(id)">
          <button
            class="building-toggle stop"
            :aria-label="`${toggleLabel(id) ? '关闭一座供能：' : '关停一座'}${calculateBuildingName(id, state)}`"
            title="关闭供能：Ctrl ×10、Shift ×25、Alt ×100，可组合"
            :disabled="runningCount(id) === 0"
             @click="emit('toggle', id, toggleDelta(id, $event, false))"
          >{{ completedCount(id) - runningCount(id) }}</button>
          <button
            class="building-toggle start"
            :class="{ 'is-shortage': underworking(id) }"
            :aria-label="`${toggleLabel(id) ? '开启一座供能：' : '启动一座'}${calculateBuildingName(id, state)}`"
             :title="`${underworking(id) ? '未完全正常工作：支持、电力或维护资源不足。' : ''}开启供能：Ctrl ×10、Shift ×25、Alt ×100，可组合`"
            :disabled="completedCount(id) === runningCount(id)"
             @click="emit('toggle', id, toggleDelta(id, $event, true))"
          >{{ runningCount(id) }}</button>
        </template>

        <span v-if="outputText(id)" class="small subtle" :data-output="id" hidden>{{ outputText(id) }}</span>
        <span class="building-cost small" hidden>
          <span
            v-for="row in costRows(id)"
            :key="row.id"
            :data-cost="row.id"
            :data-amount="row.amount"
            :class="row.enough ? 'positive' : 'subtle'"
          >{{ row.name }} {{ ['swarmSatellite', 'swarmFactory'].includes(id) && row.amount < 1 ? '0' : fmt(row.amount) }}</span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.region-name { position: relative; cursor: help; border-bottom: 1px dotted var(--muted); }
.region-description { display: none; position: absolute; z-index: 30; left: 0; top: calc(100% + 8px); width: min(380px, 75vw); padding: 12px 14px; border: 1px solid var(--line); border-radius: 5px; background: #1d1e1b; color: var(--text); font-size: 12px; font-weight: 400; line-height: 1.8; white-space: pre-line; box-shadow: 0 6px 18px #0006; pointer-events: none; }
.region-name:hover .region-description, .region-name:focus .region-description { display: block; }
.region-name:focus-visible { outline: 1px solid var(--gold); outline-offset: 3px; }
[data-hyperspace-balance] { color: var(--green); font-variant-numeric: tabular-nums; }
.building-segment-requirement { display: block; font-size: 11px; font-weight: 400; margin-top: 3px; }
</style>
