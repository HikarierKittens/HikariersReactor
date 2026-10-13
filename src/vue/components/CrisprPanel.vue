<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CrisprUpgradeId, GameState } from '../../types/state';
import { CRISPR_UPGRADES } from '../../data/crispr';
import { canAffordCrisprUpgrade } from '../../simulation/crispr';
import { fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ purchase: [id: CrisprUpgradeId] }>();
const activeView = ref<'available' | 'completed'>('available');
const all = Object.keys(CRISPR_UPGRADES) as CrisprUpgradeId[];
const available = computed(() => {
  props.revision;
  return all.filter(id => props.state.tech.includes('crispr16') && !props.state.crispr.includes(id)
    && CRISPR_UPGRADES[id].pre.every(pre => props.state.crispr.includes(pre)));
});
const completed = computed(() => {
  props.revision;
  return all.filter(id => props.state.crispr.includes(id));
});
const particles = computed(() => { props.revision; return props.state.prestige.particles; });
const casimir = computed(() => { props.revision; return props.state.prestige.casimir || 0; });
const showCasimir = computed(() => casimir.value > 0 || available.value.some(id => !!CRISPR_UPGRADES[id].casimirCost));
function affordable(id: CrisprUpgradeId): boolean { props.revision; return canAffordCrisprUpgrade(props.state, id); }
function priceText(id: CrisprUpgradeId): string {
  const upgrade = CRISPR_UPGRADES[id];
  return `${fmt(upgrade.cost)} 粒子${upgrade.casimirCost ? ` + ${fmt(upgrade.casimirCost)} 卡西米尔晶体` : ''}`;
}

interface CrisprTreeNode { id: CrisprUpgradeId; x: number; y: number }
interface CrisprTreeEdge { id: string; path: string }
interface CrisprTreeLayout {
  width: number;
  height: number;
  nodes: CrisprTreeNode[];
  edges: CrisprTreeEdge[];
  levels: { tier: number; y: number }[];
}

// Independent of the technology catalog: added upgrades only need tier/pre metadata.
function layoutCrisprTree(ids: readonly CrisprUpgradeId[]): CrisprTreeLayout {
  const nodeWidth = 160;
  const nodeHeight = 40;
  const columnGap = 36;
  const rowGap = 56;
  const left = 44;
  const top = 8;
  const rows = new Map<number, CrisprUpgradeId[]>();
  for (const id of ids) {
    const tier = CRISPR_UPGRADES[id].tier;
    const row = rows.get(tier) ?? [];
    row.push(id);
    rows.set(tier, row);
  }
  const maxTier = Math.max(4, ...all.map(id => CRISPR_UPGRADES[id].tier));
  const columns = Math.max(1, ...Array.from(rows.values(), row => row.length));
  const width = left + columns * (nodeWidth + columnGap) - columnGap + 16;
  const levels = Array.from({ length: maxTier + 1 }, (_, tier) => ({ tier, y: top + tier * (nodeHeight + rowGap) }));
  const nodes: CrisprTreeNode[] = [];
  for (const { tier, y } of levels) {
    const row = rows.get(tier) ?? [];
    const offset = (columns - row.length) * (nodeWidth + columnGap) / 2;
    row.forEach((id, index) => nodes.push({ id, x: left + offset + index * (nodeWidth + columnGap), y }));
  }
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges: CrisprTreeEdge[] = [];
  for (const node of nodes) {
    for (const pre of CRISPR_UPGRADES[node.id].pre) {
      const source = byId.get(pre);
      if (!source) continue;
      const x1 = source.x + nodeWidth / 2;
      const y1 = source.y + nodeHeight;
      const x2 = node.x + nodeWidth / 2;
      const y2 = node.y;
      const mid = (y1 + y2) / 2;
      edges.push({ id: `${pre}->${node.id}`, path: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` });
    }
  }
  return { width, height: top + (maxTier + 1) * (nodeHeight + rowGap) - rowGap + 16, nodes, edges, levels };
}
const tree = computed(() => { props.revision; return layoutCrisprTree(completed.value); });
</script>

<template>
  <nav class="tabs tech-subtabs" aria-label="CRISPR分类">
    <button data-crispr-view="available" :class="{ active: activeView === 'available' }" @click="activeView = 'available'">CRISPR-可修饰</button>
    <button data-crispr-view="completed" :class="{ active: activeView === 'completed' }" @click="activeView = 'completed'">CRISPR-已完成</button>
  </nav>
  <template v-if="activeView === 'available'">
    <p class="crispr-notice">对DNA进行永久性修改，重置后依然保留</p>
    <p class="small subtle">可用粒子：{{ fmt(particles) }}<template v-if="showCasimir"> · 可用卡西米尔晶体：{{ fmt(casimir) }}</template></p>
    <p v-if="!available.length" class="empty">暂无可修饰项目。</p>
    <article v-for="id in available" :key="id" class="card crispr-upgrade" :data-crispr-upgrade="id">
      <div class="card-top"><div class="card-title"><h3>{{ CRISPR_UPGRADES[id].name }} <span class="count">T{{ CRISPR_UPGRADES[id].tier }}</span></h3></div></div>
      <p class="cost" :class="{ negative: !affordable(id) }" :data-crispr-cost="CRISPR_UPGRADES[id].cost">价格：{{ priceText(id) }}</p>
      <p class="desc">{{ CRISPR_UPGRADES[id].desc }}</p>
      <div class="card-bottom"><button :data-crispr-purchase="id" :disabled="!affordable(id)" :aria-label="`修饰${CRISPR_UPGRADES[id].name}，消耗${priceText(id)}`" @click="emit('purchase', id)">修饰</button></div>
    </article>
  </template>
  <template v-else>
    <p v-if="!completed.length" class="empty">尚未完成 CRISPR 修饰。</p>
    <div v-else class="completed-tech-scroll" aria-label="已完成CRISPR依赖图">
      <div class="completed-tech-tree" :style="{ width: `${tree.width}px`, height: `${tree.height}px` }">
        <svg class="tech-connections" :width="tree.width" :height="tree.height" aria-hidden="true">
          <path v-for="edge in tree.edges" :key="edge.id" :data-crispr-edge="edge.id" :d="edge.path" />
        </svg>
        <div v-for="level in tree.levels" :key="level.tier" class="tech-tier-label" :data-crispr-tier="level.tier" :style="{ top: `${level.y}px` }">T{{ level.tier }}</div>
        <div v-for="node in tree.nodes" :key="node.id" class="completed-tech-node" :style="{ left: `${node.x}px`, top: `${node.y}px` }">
          <button class="building-button tech-button" :data-completed-crispr="node.id" :data-building-tip="node.id" data-tip-kind="crispr" :aria-label="`${CRISPR_UPGRADES[node.id].name}，已完成。${CRISPR_UPGRADES[node.id].desc}`"><span class="building-name">{{ CRISPR_UPGRADES[node.id].name }}</span><span class="building-pending">已完成</span></button>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.completed-tech-tree { zoom: 1.105; }
.tech-subtabs { margin-top: 6.2px; }
.crispr-notice { margin: 8px 0; color: var(--gold); }
.crispr-upgrade .card-bottom { justify-content: flex-end; }
[data-completed-crispr] { cursor: help; }
</style>
