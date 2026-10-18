<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameState, GovernmentId } from '../../types/state';
import { GOVERNMENTS, reformCooldown, calculateSoldierCapacity, calculateOperationalSoldierCapacity, calculateCombatPower, calculateSoldierPressure, calculateTrainingDuration, calculatePrestigeReward, calculateTrainingBoost, calculateBankerTaxRate } from '../../simulation/government';
import { NUCLEAR_PROJECT, calculateNuclearAffordablePercent } from '../../simulation/prestige';
import { RESOURCES } from '../../data/resources';
import { fmt, percent, storageCap, orderedCostEntries } from '../format';
import { uiPreview } from '../preview-cache';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{
  reform: [id: GovernmentId];
  tax: [rate: number];
  fill: [percent: number];
  nuclear: [];
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
const bankerRate = computed(() => { props.revision; return Number((calculateBankerTaxRate(props.state) * 100).toFixed(2)); });
const cashCap = computed(() => { props.revision; return storageCap('cash', props.state, props.revision); });
const soldierCap = computed(() => { props.revision; return calculateSoldierCapacity(props.state); });
const trainingCap = computed(() => {
  props.revision;
  const result = uiPreview.production(props.state, props.revision);
  return calculateOperationalSoldierCapacity(props.state, result.inputUnits.spaceGarrison || 0, result.digital);
});
const soldierPower = computed(() => { props.revision; return calculateCombatPower(props.state); });
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
  if (props.state.soldiers >= soldierCap.value) return '士兵已达到拥有容量，建造更多军营可继续自动训练。';
  if (props.state.soldiers >= trainingCap.value) return '训练暂停：当前可训练容量不足。太空驻军营需要运行并完整支付维护资源；已有士兵不会因此移除。';
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

  <div v-if="view === 'government'" class="settings">
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
      <p>20%税率时，每只猫基础税收1$/s。银行家每位税收+{{ bankerRate }}%（基础5%，每个证券交易所+2%）；资金正常应用幸福度、粒子与体制加成。</p>
      <p>累计资金：<span id="governmentCash">{{ fmt(state.resources.cash) }} / {{ fmt(cashCap) }}</span></p>
    </section>
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
      <p>士兵：{{ state.soldiers }} / {{ soldierCap }}（拥有容量）</p>
      <p data-soldier-training-cap>当前可训练容量：{{ trainingCap }}。太空驻军营仅按完整支付维护的运行座数计入；停机不移除已有士兵。</p>
      <p>{{ trainingStatus }}</p>
      <div class="q-bar" role="progressbar" aria-label="士兵自动训练进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="trainingRatio">
        <i :style="{ width: `${trainingRatio}%` }"></i>
      </div>
      <p>士兵工作压力：幸福度 −{{ percent(soldierPenalty) }} 个百分点（按士兵上限与体制计算）</p>
      <p>单兵战斗力：{{ fmt(soldierPower) }}；总战斗力：{{ fmt(state.soldiers * soldierPower) }}</p>
      <p>训练时间：{{ fmt(trainDuration) }}秒 / 位；进度：{{ fmt(state.trainingProgress) }}秒</p>
      <p class="small subtle">士兵独立于猫口，不占工作岗位，按规则自动训练至上限，无需分配猫猫或手动招募。每位服役士兵基础采集0.2毛皮/s。首位士兵解锁毛皮后，本周目不再撤销解锁。每座训练营累计增加{{ percent(calculateTrainingBoost(state)) }}%训练效果，每累计100%使训练速度翻倍。</p>
    </section>
  </div>
</template>
