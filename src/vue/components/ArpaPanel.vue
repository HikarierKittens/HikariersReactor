<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ArpaProjectId, CrisprUpgradeId, GameState } from '../../types/state';
import CrisprPanel from './CrisprPanel.vue';
import ChallengePanel from './ChallengePanel.vue';
import GeneModificationPanel from './GeneModificationPanel.vue';
import type { ChallengeGeneId, DnaId, GeneId } from '../../types/state';
import { isGeneModificationUnlocked } from '../../simulation/genes';
import type { ResourceId } from '../../types/economy';
import { ARPA_PROJECTS } from '../../data/projects';
import { RESOURCES } from '../../data/resources';
import { calculateProjectDescription, calculateProjectCost, calculateProjectRemainingCost, calculateAffordableProjectPercent, isProjectAtLimit, isProjectUnlocked } from '../../simulation/projects';
import { clickMultiplier, fmt, orderedCostEntries } from '../format';
import { formatCostNumber } from '../../shared/format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ invest: [id: ArpaProjectId, percent: number]; queue: [id: ArpaProjectId, count: number]; crisprPurchase: [id: CrisprUpgradeId]; challengeLaunch: [genes: ChallengeGeneId[]]; dnaCraft: [id: DnaId, count: number]; geneUpgrade: [id: GeneId] }>();

const activeView = ref<'buildings' | 'progress' | 'genetics' | 'crispr' | 'challenges'>('buildings');
const buildingsUnlocked = computed(() => { props.revision; return props.state.tech.includes('arpa'); });
const geneticsUnlocked = computed(() => { props.revision; return props.state.tech.includes('genetics'); });
const progressUnlocked = computed(() => {
  props.revision;
  return (Object.keys(ARPA_PROJECTS) as ArpaProjectId[]).some(id => id !== 'geneSequencing' && !ARPA_PROJECTS[id].repeatable && isProjectUnlocked(id, props.state));
});
const crisprUnlocked = computed(() => { props.revision; return props.state.tech.includes('crispr16'); });
const geneModificationUnlocked = computed(() => { props.revision; return isGeneModificationUnlocked(props.state); });
const challengesUnlocked = computed(() => { props.revision; return props.state.crispr.includes('challengeGene'); });
const currentView = computed(() => {
  props.revision;
  const available = {
    buildings: buildingsUnlocked.value,
    progress: progressUnlocked.value,
    genetics: geneticsUnlocked.value,
    crispr: crisprUnlocked.value,
    challenges: challengesUnlocked.value,
  };
  if (available[activeView.value]) return activeView.value;
  return (Object.keys(available) as (keyof typeof available)[]).find(id => available[id]) ?? null;
});
const projects = computed(() => {
  props.revision;
  if (!currentView.value) return [];
  return (Object.keys(ARPA_PROJECTS) as ArpaProjectId[])
    .filter(id => isProjectUnlocked(id, props.state) && (currentView.value === 'genetics' ? id === 'geneSequencing' : id !== 'geneSequencing' && (currentView.value === 'progress' ? !ARPA_PROJECTS[id].repeatable : !!ARPA_PROJECTS[id].repeatable)))
    .map(id => {
      const definition = ARPA_PROJECTS[id];
      const cost = calculateProjectCost(id, props.state);
      const remaining = calculateProjectRemainingCost(id, props.state);
      const completed = props.state.arpaBuildings[id] || 0;
      const progress = props.state.arpaProgress[id] || 0;
      const atLimit = isProjectAtLimit(id, props.state);
      const pending = props.state.queue.filter(item => item.kind === 'arpa' && item.id === id).length;
      // These are the same limits enforced by isProjectAtLimit/enqueueProject.
      const limit = definition.repeatable ? Number.MAX_SAFE_INTEGER : 1;
      return {
        id,
        definition,
        description: calculateProjectDescription(id, props.state),
        completed,
        progress,
        atLimit,
        pending,
        limit,
        queueDisabled: atLimit || props.state.queue.length >= 100 || completed + pending >= limit,
        costRows: orderedCostEntries(cost).map(([resource, amount]) => ({
          resource,
          name: RESOURCES[resource as ResourceId].name,
          amount,
          paid: amount - (remaining[resource as ResourceId] || 0),
          missing: props.state.resources[resource as ResourceId] + 1e-8 < (remaining[resource as ResourceId] || 0),
        })),
        remainingText: orderedCostEntries(remaining).map(([resource, amount]) =>
          `${RESOURCES[resource as ResourceId].name} ${formatCostNumber(amount)}`).join(' · '),
        affordable: calculateAffordableProjectPercent(id, props.state, 100),
      };
    });
});
</script>

<template>
  <nav class="tabs" aria-label="ARPA分类">
    <button v-if="buildingsUnlocked" data-arpa-view="buildings" :class="{ active: currentView === 'buildings' }" @click="activeView = 'buildings'">ARPA建筑</button>
    <button v-if="progressUnlocked" data-arpa-view="progress" :class="{ active: currentView === 'progress' }" @click="activeView = 'progress'">进度</button>
    <button v-if="geneticsUnlocked" data-arpa-view="genetics" :class="{ active: currentView === 'genetics' }" @click="activeView = 'genetics'">遗传学</button>
    <button v-if="crisprUnlocked" data-arpa-view="crispr" :class="{ active: currentView === 'crispr' }" @click="activeView = 'crispr'">CRISPR</button>
    <button v-if="challengesUnlocked" data-arpa-view="challenges" :class="{ active: currentView === 'challenges' }" @click="activeView = 'challenges'">挑战模式</button>
  </nav>
  <ChallengePanel v-if="currentView === 'challenges'" :state="state" :revision="revision" @launch="emit('challengeLaunch', $event)" />
  <CrisprPanel v-else-if="currentView === 'crispr'" :state="state" :revision="revision" @purchase="emit('crisprPurchase', $event)" />
  <template v-else-if="currentView">
  <div v-if="!projects.length" class="empty">尚无可用工程，研究 A.R.P.A 及对应的工程前置科技后开启。</div>
  <div class="arpa-project-grid" :class="{ 'is-buildings': currentView === 'buildings' }">
  <article v-for="project in projects" :key="project.id" class="card arpa-project">
    <h3>{{ project.definition.name }}</h3>
    <p class="desc">{{ project.description }}</p>
    <p>已建 {{ fmt(project.completed) }}<span v-if="!project.definition.repeatable"> / {{ fmt(project.limit) }}</span><span v-if="project.pending"> · 队列 {{ project.pending }}</span></p>
    <template v-if="!project.atLimit">
      <p class="arpa-progress-summary">当前建设进度：{{ Number(project.progress.toFixed(2)) }}%</p>
      <div class="q-bar arpa-progress" role="progressbar" :aria-label="`${project.definition.name}建设进度`" :aria-valuenow="project.progress" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ width: `${project.progress}%` }"></i>
      </div>
      <p class="cost">
        <span v-for="row in project.costRows" :key="row.resource" :data-cost="row.resource" :data-amount="row.amount" :class="{ negative: row.missing }">{{ row.name }} 已投入 {{ formatCostNumber(row.paid) }} / {{ formatCostNumber(row.amount) }}</span>
      </p>
      <p class="small subtle">剩余需求：{{ project.remainingText || '无' }}</p>
      <div class="actions">
        <button v-for="n in [1, 25, 50, 75, 100]" :key="n" :data-arpa-invest="project.id" :data-percent="n" :disabled="project.affordable <= 0" :title="`每项资源最多投入 ${n}%，各自按库存投入`" @click="emit('invest', project.id, n)">建设 {{ n }}%</button>
        <button :data-arpa-queue="project.id" title="加入队列；Ctrl ×10、Shift ×25、Alt ×100" :disabled="project.queueDisabled" @click="emit('queue', project.id, clickMultiplier($event))">加入队列</button>
      </div>
    </template>
    <p v-else class="subtle">已达到本周目上限。</p>
  </article>
  </div>
  <GeneModificationPanel v-if="currentView === 'genetics' && geneModificationUnlocked" :state="state" :revision="revision"
    @craft="(id, count) => emit('dnaCraft', id, count)" @upgrade="emit('geneUpgrade', $event)" />
  </template>
</template>

<style scoped>
.arpa-project-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.arpa-project-grid.is-buildings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.arpa-project { min-width: 0; overflow-wrap: anywhere; }
.arpa-project .actions { flex-wrap: wrap; }
</style>
