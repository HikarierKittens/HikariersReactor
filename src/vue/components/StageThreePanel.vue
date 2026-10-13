<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { STAGE_THREE_EXPERIMENTS, stageThreeExperimentAvailable, type StageThreeExperimentId } from '../../simulation/stage-three';
import { canPayCost } from '../../simulation/costs';
import { uiPreview } from '../preview-cache';
import { fmt, orderedCostEntries } from '../format';
const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ experiment: [id: StageThreeExperimentId] }>();
const support = computed(() => { props.revision; return uiPreview.support(props.state, props.revision).stageThree; });
const nextStep = computed(() => {
  props.revision;
  const s = props.state;
  if (!s.tech.includes('globalObservationCalibration')) return '前往科技页，研究「全域观测校准」。';
  if (!s.arpaBuildings.deepSpaceInterferometer) return '前往ARPA → 进度，完成「深空干涉阵列」各项材料投入。';
  if (!s.tech.includes('anomalyMapping')) return '前往科技页，研究「异常区域测绘」。';
  if (!s.stageThree.probeCompleted) return '准备氦-3与合金，在下方执行「异常区探测任务」。';
  if (!s.tech.includes('anomalyResponse')) return '前往科技页，研究「异常响应实验」。';
  if (!s.arpaBuildings.deepSpaceLab) return '前往ARPA → 进度，完成「深空实验平台」各项材料投入。';
  if (!s.tech.includes('fieldConstraintTheory')) return '前往科技页，研究「场约束理论」。';
  if (!s.stageThree.fieldStabilized) return '在下方空间异常区建造并启用场约束阵列，提供维护资源并让游戏实际运行一次；暂停时不会记录首次稳定运行。';
  if (!s.tech.includes('dualEndCoupling')) return '前往科技页，研究「双端场耦合」。';
  if (!s.stageThree.signalCompleted) return '准备电力、E-710与纳米管，执行下方「信号传递实验」。';
  if (!s.tech.includes('finiteAperture')) return '前往科技页，研究「有限孔径稳定」。';
  if (!s.stageThree.transferCompleted) return '准备电力、钢、合金与E-710，执行下方「首次物质转移」。';
  if (!s.tech.includes('anomalyTopology')) return '前往科技页，研究「异常拓扑测绘」，寻找适合部署远端锚点的空间环境。';
  if (!s.arpaBuildings.remoteAnchor) return '前往ARPA → 进度，完成「远端锚点验证」工程，部署并校准接收装置。';
  if (!s.stageThree.remoteLinked) return '准备电力、E-710、氦-3与纳米管，执行下方「远端连接验证」。无需为实验关闭通信或货运设施。';
  return '太阳系内远端连接已验证。可建设锚点货运站扩充仓储，或建设民用航线站增加猫口、资金与猫粮容量。当前异常研究阶段已完成。';
});
const experiments = computed(() => {
  props.revision;
  const s = props.state;
  return (['probe', 'signal', 'transfer', 'remote'] as const).map(id => {
    const definition = STAGE_THREE_EXPERIMENTS[id];
    const complete = id === 'probe' ? s.stageThree.probeCompleted : id === 'signal' ? s.stageThree.signalCompleted : id === 'transfer' ? s.stageThree.transferCompleted : s.stageThree.remoteLinked;
    const unlocked = stageThreeExperimentAvailable(s, id);
    const affordable = canPayCost(s.resources, definition.cost);
    return { id, ...definition, complete, unlocked, affordable,
      prerequisite: id === 'probe' ? '需要异常区域测绘与已建深空干涉阵列' : id === 'signal' ? '需要双端场耦合与首次稳定运行的场约束阵列' : id === 'transfer' ? '需要有限孔径稳定与已完成信号实验' : '需要完成首次物质转移、研究异常拓扑测绘并完成远端锚点验证工程',
      costs: orderedCostEntries(definition.cost).map(([resource, amount]) => ({ id: resource, name: RESOURCES[resource as ResourceId].name, amount: fmt(amount), enough: s.resources[resource as ResourceId] >= amount })) };
  });
});
</script>

<template>
  <section class="stage-three" data-stage-three>
    <h3>第三阶段 · 异常研究</h3>
    <p class="subtle">先在科技页建立理论，在ARPA完成观测与实验工程，再进行独立验证。剧情自动收录，无需阅读或等待。</p>
    <p data-stage3-next-step><strong>下一步：</strong>{{ nextStep }}</p>
    <p data-stage3-stability>稳定度：已占用 {{ support.used }} / 总量 {{ support.capacity }} · 可用 {{ support.available }}</p>
    <p class="small subtle">运行阵列 {{ support.arrays }} 座 · 运行通信节点 {{ support.relays }} 座 · 运行货运站 {{ support.freight }} 座 · 运行民用航路站 {{ support.civilian }} 座。每座阵列提供2稳定度；通信、货运与民用航路站各占用2，按此顺序分配。</p>
    <p class="small subtle">任务即时完成且每周目仅一次。满足科技与工程前置、备齐一次性资源即可执行，不要求可用稳定度或支付后的维护储备。稳定度仍用于设施运行；缺少任务资源时不会扣款或损毁设施。</p>
    <div class="stage3-grid">
      <article v-for="row in experiments" :key="row.id" class="experiment-card" :class="{ 'is-complete': row.complete }">
        <header class="experiment-heading">
          <h4>{{ row.name }}</h4>
          <span class="experiment-status" :class="{ ready: row.complete || (row.unlocked && row.affordable) }">{{ row.complete ? '已完成' : !row.unlocked ? '未解锁' : row.affordable ? '可执行' : '待准备' }}</span>
        </header>
        <p v-if="row.complete" class="experiment-complete">已完成验证，记录已收录至剧情档案。</p>
        <template v-else>
          <div class="experiment-costs">
            <span class="experiment-label">一次性投入</span>
            <dl>
              <div v-for="cost in row.costs" :key="cost.id">
                <dt>{{ cost.name }}</dt><dd :class="{ insufficient: row.unlocked && !cost.enough }">{{ cost.amount }}</dd>
              </div>
            </dl>
          </div>
          <p class="experiment-stability">无需稳定度，仅支付一次性资源费用</p>
          <div class="experiment-footer">
            <p v-if="!row.unlocked" class="experiment-hint">{{ row.prerequisite }}</p>
            <p v-else-if="!row.affordable" class="experiment-hint">实验材料不足，请补充所需资源。</p>
            <p v-else class="experiment-hint">条件已满足，执行后即时完成。</p>
            <button :data-stage3-action="row.id" :aria-label="`执行${row.name}`" :disabled="!row.unlocked || !row.affordable" @click="emit('experiment', row.id)">执行实验</button>
          </div>
        </template>
      </article>
    </div>
    <p v-if="state.stageThree.remoteLinked" class="subtle">远端连接已验证。每座运行货运站为木材至铱的有限容量资源提供32K基础仓储；民用航路站提供5猫口与资金、猫粮各16K基础容量。连接仍需双端装置、异常环境与持续维护。当前连接用于太阳系内的设施与无人货运，猫猫穿越仍未获准；ESS远航始终保留。</p>
  </section>
</template>
<style scoped>
.stage-three { margin-bottom: 24px; padding: 16px; border: 1px solid var(--line); border-radius: 6px; }
.stage3-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; margin-top: 18px; }
.experiment-card { display: flex; flex-direction: column; min-width: 0; padding: 18px; border: 1px solid #49473e; border-radius: 6px; background: #222321; }
.experiment-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 18px; }
.experiment-heading h4 { margin: 0; font-size: 14px; line-height: 1.6; font-weight: 600; }
.experiment-status { flex-shrink: 0; padding: 2px 7px; border: 1px solid #555247; border-radius: 4px; color: var(--muted); font-size: 11px; }
.experiment-status.ready { color: var(--green); border-color: #4c6244; background: #293126; }
.experiment-label { color: var(--muted); font-size: 11px; }
.experiment-costs dl { display: grid; gap: 7px; margin: 10px 0 0; }
.experiment-costs dl > div { display: flex; justify-content: space-between; gap: 12px; }
.experiment-costs dt { color: var(--muted); }
.experiment-costs dd { margin: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.experiment-costs dd.insufficient { color: var(--red); }
.experiment-stability { font-size: 12px; margin: 16px 0; padding-top: 12px; border-top: 1px solid #3d3d35; }
.experiment-footer { margin-top: auto; }
.experiment-hint { color: var(--muted); font-size: 12px; line-height: 1.7; min-height: 3.4em; margin: 0 0 12px; }
.experiment-footer button { display: block; width: 100%; min-height: 38px; padding: 8px 12px; }
.experiment-footer button:not(:disabled) { border-color: #7b704e; background: #413d30; }
.experiment-footer button:hover:not(:disabled) { background: #514a35; }
.experiment-complete { color: var(--green); font-size: 12px; line-height: 1.8; margin: 0; }
.experiment-card.is-complete { border-color: #4c6244; }
</style>
