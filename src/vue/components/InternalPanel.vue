<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameState, GovernmentId } from '../../types/state';
import { GOVERNMENTS, reformCooldown, calculateArmyLimit, calculateOperationalSoldierCapacity, calculateCombatPower, calculateSoldierDefense, defenseCasualtyMultiplier, soldierFurPerSoldier, calculateSoldierPressure, calculateTrainingDuration, calculatePrestigeReward, calculateTrainingBoost } from '../../simulation/government';
import { NUCLEAR_PROJECT, calculateNuclearAffordablePercent } from '../../simulation/prestige';
import { RESOURCES } from '../../data/resources';
import { fmt, percent, storageCap, orderedCostEntries } from '../format';
import { uiPreview } from '../preview-cache';
import {
  NEIGHBORS, NEIGHBOR_IDS, RAID_ACTIONS, OCCUPATION_SOLDIERS, OCCUPATION_OUTPUT_BONUS,
  OCCUPATION_TAX_PENALTY, UNIFICATION_OUTPUT_BONUS, UNIFICATION_STORAGE_BONUS, type NeighborId, type RaidTier,
} from '../../data/neighbors';
import { isNeighborsUnlocked, isWorldUnified, previewRaid, neighborStrength, garrisonedSoldiers } from '../../simulation/neighbors';
import { hospitalHealPerDay } from '../../simulation/hospital';
import { buildRaidEconomy } from '../../simulation/neighbor-economy';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  reform: [id: GovernmentId];
  tax: [rate: number];
  fill: [percent: number];
  nuclear: [];
  raid: [id: string, tier: number, soldiers: number];
  withdraw: [id: string];
}>();

const view = ref<'government' | 'military'>('government');
const reformOpen = ref(false);
const current = computed(() => { props.revision; return GOVERNMENTS[props.state.government]; });
const cooldown = computed(() => { props.revision; return reformCooldown(props.state); });
const cooldownDays = computed(() => { props.revision; return Math.ceil(cooldown.value / 5); });
const alternatives = computed(() => {
  props.revision;
  return (Object.entries(GOVERNMENTS) as [GovernmentId, typeof GOVERNMENTS[GovernmentId]][])
    .filter(([id, g]) => id !== props.state.government && props.state.tech.includes(g.tech));
});
const cashCap = computed(() => { props.revision; return storageCap('cash', props.state, props.revision); });
const soldierCap = computed(() => { props.revision; return calculateArmyLimit(props.state); });
const healedPerDay = computed(() => { props.revision; return hospitalHealPerDay(props.state); });
const trainingCap = computed(() => {
  props.revision;
  const result = uiPreview.production(props.state, props.revision);
  return calculateOperationalSoldierCapacity(props.state, result.inputUnits.spaceGarrison || 0, result.digital);
});
const soldierPower = computed(() => { props.revision; return calculateCombatPower(props.state); });
const soldierDefense = computed(() => { props.revision; return calculateSoldierDefense(props.state); });
const soldierFur = computed(() => { props.revision; return soldierFurPerSoldier(props.state); });
const defenseCasualty = computed(() => { props.revision; return defenseCasualtyMultiplier(props.state); });
const soldierPenalty = computed(() => { props.revision; return calculateSoldierPressure(props.state, uiPreview.support(props.state, props.revision).digital); });
const trainDuration = computed(() => { props.revision; return calculateTrainingDuration(props.state); });
const trainingRatio = computed(() => {
  props.revision;
  return Math.max(0, Math.min(100, props.state.trainingProgress / trainDuration.value * 100));
});
const trainingStatus = computed(() => {
  props.revision;
  if (!props.state.tech.includes('military')) return '研究军事后解锁自动训练。';
  if (!soldierCap.value) return '建造军营后开始自动训练，每座提供2个士兵名额。';
  if (props.state.soldiers >= soldierCap.value) return '士兵已达到上限，建造更多军营或开启已关闭的军营可继续自动训练。';
  if (props.state.soldiers >= trainingCap.value) return '训练暂停：当前可训练容量不足。太空驻军营需要运行并完整支付维护资源；士兵数不会超过上限。';
  return `自动训练中，约 ${fmt(Math.max(0, trainDuration.value - props.state.trainingProgress))} 秒后增加一位士兵。`;
});
const nuclearProgress = computed(() => { props.revision; return props.state.nuclearProgress || 0; });
const nuclearCosts = computed(() => {
  props.revision;
  return orderedCostEntries(NUCLEAR_PROJECT.cost)
    .map(([r, n]) => `${RESOURCES[r as keyof typeof RESOURCES].name} ${fmt(n * nuclearProgress.value / 100)} / ${fmt(n)}`)
    .join(' · ');
});
const nuclearOptions = computed(() => {
  props.revision;
  return [1, 25, 50, 100].map(amount => ({ amount, affordable: calculateNuclearAffordablePercent(props.state, amount) }));
});
const reward = computed(() => { props.revision; return calculatePrestigeReward(props.state); });
const canLaunch = computed(() => {
  props.revision;
  return props.state.tech.includes('nuclearProgram') && nuclearProgress.value === 100
    && Number.isSafeInteger(props.state.prestige.particles + reward.value)
    && props.state.prestige.nuclearResets < Number.MAX_SAFE_INTEGER;
});

function reform(id: GovernmentId): void {
  emit('reform', id);
  reformOpen.value = false;
}

// ---- 临近势力 ----
/** Per-neighbour draft state: chosen action tier and how many soldiers to send. */
const raidTier = ref<Record<string, RaidTier>>({});
const raidSoldiers = ref<Record<string, number>>({});
const raidOpen = ref(false);

const neighborsUnlocked = computed(() => {
  props.revision;
  return isNeighborsUnlocked(props.state);
});
/** 世界统一 replaces the whole neighbour panel with the unification summary. */
const worldUnified = computed(() => { props.revision; return isWorldUnified(props.state); });
const garrison = computed(() => { props.revision; return garrisonedSoldiers(props.state); });
const availableSoldiers = computed(() => {
  props.revision;
  return Math.max(0, props.state.soldiers - garrison.value);
});
/** Soldiers not locked in a garrison can be sent. */
function soldierDraft(id: NeighborId): number {
  const raw = raidSoldiers.value[id];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(Math.max(0, Math.floor(raw)), availableSoldiers.value);
}
function tier(id: NeighborId): RaidTier {
  return raidTier.value[id] ?? 0;
}
function setTier(id: NeighborId, value: RaidTier): void {
  raidTier.value = { ...raidTier.value, [id]: value };
}
function setSoldiers(id: NeighborId, event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  const value = event.currentTarget.valueAsNumber;
  raidSoldiers.value = { ...raidSoldiers.value, [id]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0 };
}
function maxSoldiers(id: NeighborId): void {
  raidSoldiers.value = { ...raidSoldiers.value, [id]: availableSoldiers.value };
}
function dispatchRaid(id: NeighborId): void {
  const count = soldierDraft(id);
  if (count <= 0) return;
  emit('raid', id, tier(id), count);
  raidSoldiers.value = { ...raidSoldiers.value, [id]: 0 };
}
/** Rebuilt once per view revision: the panel calls preview() for every row and keystroke. */
const raidEconomy = computed(() => { props.revision; return buildRaidEconomy(props.state, props.revision); });
function preview(id: NeighborId) {
  props.revision;
  return previewRaid(props.state, id, tier(id), soldierDraft(id), raidEconomy.value);
}
function strength(id: NeighborId) {
  props.revision;
  return neighborStrength(id, props.state);
}
function isOccupied(id: NeighborId): boolean {
  props.revision;
  return props.state.neighbors.occupied.includes(id);
}
function withdraw(id: NeighborId): void {
  emit('withdraw', id);
}

function setTax(event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  const value = Number(event.currentTarget.value);
  if (Number.isFinite(value) && value >= 0 && value <= 30) emit('tax', value);
}
</script>

<template>
  <nav class="tabs" aria-label="内部管理分类">
    <button data-internal-view="government" :class="{ active: view === 'government' }" :aria-pressed="view === 'government'" @click="view = 'government'">政府</button>
    <button data-internal-view="military" :class="{ active: view === 'military' }" :aria-pressed="view === 'military'" @click="view = 'military'">军事</button>
  </nav>

  <div v-if="view === 'government'" class="settings government-layout">
    <div class="government-col">
    <section>
      <h3>政府体制：{{ current.name }}</h3>
      <p>{{ current.desc }}</p>
      <p>改革冷却：{{ cooldown > 0 ? `${cooldownDays} 游戏日（${Math.ceil(cooldown)} 秒）` : '可立即改革' }}</p>
      <button id="openGovernmentReform" :disabled="!state.tech.includes('government') || cooldown > 0" :aria-expanded="reformOpen" @click="reformOpen = !reformOpen">改革体制</button>
      <p v-if="!state.tech.includes('government')" class="subtle">研究政府后解锁基本体制。</p>
      <div v-if="reformOpen" class="actions">
        <button v-for="[id, g] in alternatives" :key="id" :data-government="id" :data-building-tip="id" data-tip-kind="government" :disabled="cooldown > 0" @click="reform(id)">{{ g.name }}</button>
      </div>
    </section>

    <section>
      <h3>税收管理</h3>
      <p>税率：<strong id="taxRateValue">{{ state.taxRate }}%</strong>（0%～30%，基准20%）</p>
      <label for="taxRateInput">调整税率</label>
      <input id="taxRateInput" type="range" min="0" max="30" step="1" :value="state.taxRate" @input="setTax">
      <p>相对20%税率的幸福度影响：{{ state.taxRate > 20 ? '−' : '+' }}{{ Math.abs(20 - state.taxRate) }}个百分点。</p>
      <p>20%税率时，每只猫基础税收1$/s。</p>
      <p>累计资金：<span id="governmentCash">{{ fmt(state.resources.cash) }} / {{ fmt(cashCap) }}</span></p>
    </section>
    </div>

    <aside class="government-side">
      <section v-if="worldUnified" data-world-unified>
        <h3>世界统一</h3>
        <p class="small">敌对国家已经消失，世界被统一了。占领期间的税收、驻军与产量加成一并结束。</p>
        <p class="small" data-unification-bonus>全局产量 +{{ UNIFICATION_OUTPUT_BONUS * 100 }}%，所有普通资源储量 +{{ UNIFICATION_STORAGE_BONUS * 100 }}%。</p>
      </section>
      <section v-else-if="!neighborsUnlocked">
        <h3>临近势力</h3>
        <p class="subtle">研究政府，并拥有至少一名士兵后解锁。</p>
      </section>
      <section v-else data-neighbors>
        <h3>临近势力</h3>
        <p class="small subtle">敌对行动会降低好感度，归零时对方会反击。被占领的城市提供全局产量加成，但需要驻军并降低税收。</p>
        <p class="small" data-garrison-summary>驻军占用：{{ garrison }} 名 · 可派遣：{{ availableSoldiers }} 名</p>
        <div v-for="id in NEIGHBOR_IDS" :key="id" class="neighbor" :data-neighbor="id">
          <div class="neighbor-head">
            <strong>{{ NEIGHBORS[id].name }}</strong>
            <span v-if="isOccupied(id)" class="neighbor-tag" data-neighbor-occupied>已占领</span>
          </div>
          <p class="small subtle">{{ isOccupied(id) ? NEIGHBORS[id].capturedDesc : NEIGHBORS[id].desc }}</p>
          <p class="small" :data-neighbor-stats="id">
            军事 {{ fmt(state.neighbors.values[id].military) }} · 经济 {{ fmt(state.neighbors.values[id].economy) }}
            · 好感 {{ fmt(state.neighbors.values[id].opinion) }}% · 守备 {{ fmt(strength(id)) }}
          </p>
          <template v-if="isOccupied(id)">
            <p class="small">提供全局产量 +{{ OCCUPATION_OUTPUT_BONUS * 100 }}%，占用 {{ OCCUPATION_SOLDIERS }} 名驻军，税收 −{{ OCCUPATION_TAX_PENALTY }}%。</p>
            <button :data-neighbor-withdraw="id" @click="withdraw(id)">撤出城市</button>
          </template>
          <template v-else>
            <div class="actions neighbor-actions">
              <button v-for="action in [0, 1, 2, 3]" :key="action" :data-neighbor-action="id" :data-tier="action"
                :class="{ active: tier(id) === action }" :aria-pressed="tier(id) === action"
                :data-building-tip="`raid-${action}`" data-tip-kind="neighbor" @click="setTier(id, action as 0 | 1 | 2 | 3)">{{ RAID_ACTIONS[action as 0 | 1 | 2 | 3].name }}</button>
            </div>
            <p class="small subtle">{{ RAID_ACTIONS[tier(id)].desc }}</p>
            <label :for="`raid-soldiers-${id}`">派遣士兵</label>
            <div class="actions neighbor-send">
              <input :id="`raid-soldiers-${id}`" :data-neighbor-soldiers="id" type="number" min="0" :max="availableSoldiers" :value="soldierDraft(id)" @input="setSoldiers(id, $event)">
              <button :data-neighbor-max="id" @click="maxSoldiers(id)">最大</button>
              <button :data-neighbor-raid="id" :disabled="availableSoldiers < 1 || soldierDraft(id) < 1 || !preview(id).available" @click="dispatchRaid(id)">执行{{ RAID_ACTIONS[tier(id)].name }}</button>
            </div>
            <p class="small" :data-neighbor-preview="id">
              我方战力 {{ fmt(preview(id).strength) }} / 需要 {{ fmt(preview(id).required) }}；预计伤亡 {{ fmt(Math.round(preview(id).expectedLosses)) }}
              <template v-if="tier(id) === 3">；占领需存活 {{ RAID_ACTIONS[3].minSurvivors }} 名以上</template>
              <template v-if="preview(id).reason"> · {{ preview(id).reason }}</template>
            </p>
            <p class="small subtle" data-neighbor-loot>可掠夺：<template v-for="[resource, amount] in Object.entries(preview(id).loot)" :key="resource">{{ RESOURCES[resource as keyof typeof RESOURCES].name }} {{ fmt(amount as number) }} </template></p>
          </template>
        </div>
      </section>
    </aside>
  </div>

  <div v-else class="settings">
    <section v-if="state.tech.includes('nuclearProgram')" class="arpa-project">
      <h3>建造超级核弹计划</h3>
      <p class="desc">填充完成后可发射核弹，结束本周目并获得粒子。发射会重置本周目，保留威望与成就。</p>
      <p>已投入 / 总需求：{{ nuclearCosts }}</p>
      <div class="q-bar arpa-progress" role="progressbar" aria-label="超级核弹填充进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="nuclearProgress">
        <i :style="{ width: `${nuclearProgress}%` }"></i>
      </div>
      <p>{{ nuclearProgress }}%</p>
      <div class="actions">
        <button v-if="nuclearProgress === 100" id="launchNuclear" class="danger" :disabled="!canLaunch" data-building-tip="nuclear" data-tip-kind="prestige-reset" @click="emit('nuclear')">发射核弹</button>
        <template v-else>
          <button v-for="option in nuclearOptions" :key="option.amount" :data-nuclear-fill="option.amount" :disabled="option.affordable < 1" :title="`当前可投入 ${option.affordable}%`" @click="emit('fill', option.amount)">填充 {{ option.amount }}%</button>
        </template>
      </div>
      <p class="small">资源不足时仅投入可负担的整百分比。当前核爆预计获得 {{ fmt(reward) }} 粒子（以发射时人口与士兵数量计算）。</p>
    </section>
    <p v-else class="empty">研究核弹计划后解锁超级核弹填充与发射。</p>

    <section>
      <h3>士兵管理</h3>
      <p>士兵：{{ state.soldiers }} / {{ soldierCap }}（上限）</p>
      <p v-if="state.wounded > 0 || healedPerDay > 0" data-wounded-line>
        伤兵：{{ fmt(state.wounded) }} 名（不可参战）
        <template v-if="healedPerDay > 0">；医院每游戏日治愈 {{ fmt(healedPerDay) }} 名</template>
        <template v-else>；建造医院后可治愈</template>
      </p>
      <p data-soldier-training-cap>士兵上限：{{ soldierCap }}（运行的军营与驻军各提供 2 个名额，世界模拟器 4 个）。超出上限的士兵会立即移除；可训练容量为 {{ trainingCap }}，容量不足时训练暂停。</p>
      <p>{{ trainingStatus }}</p>
      <div class="q-bar" role="progressbar" aria-label="士兵自动训练进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="trainingRatio">
        <i :style="{ width: `${trainingRatio}%` }"></i>
      </div>
      <p>士兵工作压力：幸福度 −{{ percent(soldierPenalty) }} 个百分点（按士兵上限与体制计算）</p>
      <p>单兵战斗力：<span class="soldier-stat" tabindex="0" data-building-tip="combatPower" data-tip-kind="soldier" data-soldier-combat :aria-label="`查看单兵战斗力 ${fmt(soldierPower)} 的来源`">{{ fmt(soldierPower) }}</span>；总战斗力：{{ fmt(state.soldiers * soldierPower) }}</p>
      <p>单兵防御力：<span class="soldier-stat" tabindex="0" data-building-tip="defense" data-tip-kind="soldier" data-soldier-defense :aria-label="`查看单兵防御力 ${fmt(soldierDefense)} 的来源`">{{ fmt(soldierDefense) }}</span>（当前伤亡 ×{{ fmt(defenseCasualty) }}）</p>
      <p>士兵毛皮采集：<span :data-soldier-fur="soldierFur">{{ fmt(state.soldiers * soldierFur) }}</span> /s（每位 <span data-soldier-fur-per>{{ fmt(soldierFur) }}</span>，按单兵战斗力开方递增）</p>
      <p>训练时间：{{ fmt(trainDuration) }}秒 / 位；进度：{{ fmt(state.trainingProgress) }}秒</p>
      <p class="small subtle">士兵独立于猫口，不占工作岗位，按规则自动训练至上限，无需分配猫猫或手动招募。每位服役士兵采集 0.2 × 单兵战斗力^0.5 毛皮/s——战斗力越高采得越多，但增幅按平方根递减，后期毛皮主力仍是工厂。首位士兵解锁毛皮后，本周目不再撤销解锁。每座训练营累计增加{{ percent(calculateTrainingBoost(state)) }}%训练效果，每累计100%使训练速度翻倍。</p>
    </section>
  </div>
</template>

<style scoped>
.government-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 1.25fr); gap: 20px; align-items: start; }
.neighbor { border-bottom: 1px solid #514e42; padding: 8px 0; }
.neighbor:last-child { border-bottom: 0; }
.neighbor-head { display: flex; align-items: baseline; gap: 8px; }
.neighbor-tag { color: #8bc77b; font-size: 12px; }
.neighbor-actions { gap: 6px; margin: 4px 0; }
.neighbor-actions button.active { border-color: #8bc77b; color: #8bc77b; }
.neighbor-send { align-items: center; gap: 6px; }
.neighbor-send input { width: 80px; }
/* Collapse only where the app itself goes single-column (style.css max-width:860px). */
@media (max-width: 860px) { .government-layout { grid-template-columns: minmax(0, 1fr); } }
</style>
