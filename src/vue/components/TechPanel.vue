<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GameState } from '../../types/state';
import type { TechnologyId } from '../../types/technologies';
import { TECHNOLOGIES } from '../../data/technologies';
import { calculateTechCost } from '../../simulation/government';
import { canPayCost } from '../../simulation/costs';
import { isTechnologyUnlocked } from '../../simulation/unlocks';
import { calculateTechnologyTier } from '../../simulation/technology';
import { KEY_TECHNOLOGIES, layoutTechTree } from '../tech-tree';

const qHeld = ref(false);
function onKeyDown(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = true; }
function onKeyUp(event: KeyboardEvent): void { if (event.key.toLowerCase() === 'q') qHeld.value = false; }
onMounted(() => { window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); });
onUnmounted(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); });

const props = defineProps<{ state: GameState; revision: number; techView: string }>();
const emit = defineEmits<{ research: [id: TechnologyId, forceQueue: boolean]; techView: [view: string] }>();
const all = Object.keys(TECHNOLOGIES) as TechnologyId[];
const available = computed(() => {
  props.revision;
  return all.filter(id => !props.state.tech.includes(id) && isTechnologyUnlocked(id, props.state));
});
const researched = computed(() => { props.revision; return all.filter(id => props.state.tech.includes(id)); });
const tree = computed(() => { props.revision; return layoutTechTree(researched.value); });
const queued = (id: TechnologyId) => props.state.queue.some(q => q.kind === 'tech' && q.id === id);
</script>

<template>
  <nav class="tabs tech-subtabs" aria-label="科技分类">
    <button data-tech-view="available" :class="{ active: techView === 'available' }" @click="emit('techView', 'available')">可研究</button>
    <button data-tech-view="completed" :class="{ active: techView === 'completed' }" @click="emit('techView', 'completed')">已研究 {{ researched.length }} 项</button>
  </nav>
  <template v-if="techView === 'available'">
    <div v-if="!available.length" class="empty">暂无可研究科技。</div>
    <div class="building-grid">
      <div v-for="id in available" :key="id" class="building-control tech-control">
        <button class="building-button tech-button" :class="[canPayCost(state.resources, calculateTechCost(id, state)) ? 'is-affordable' : 'is-unaffordable', { 'is-key-tech': KEY_TECHNOLOGIES.has(id) }]"
          :data-research="id" :data-building-tip="id" data-tip-kind="tech" :disabled="queued(id)"
          :aria-label="`${TECHNOLOGIES[id].name}${queued(id) ? '已在队列' : '可研究'}`" @click="emit('research', id, !!(state.settings.queueHotkeys && (qHeld || ($event as MouseEvent).shiftKey)))">
          <span class="building-name">{{ TECHNOLOGIES[id].name }}</span>
          <span class="building-count">{{ calculateTechnologyTier(id) < 0 ? '特殊' : `T${calculateTechnologyTier(id)}` }}</span>
          <span v-if="queued(id)" class="building-pending">已在队列</span>
        </button>
        <button class="building-info" :data-building-tip="id" data-tip-kind="tech" :aria-label="`查看${TECHNOLOGIES[id].name}详情`">ⓘ</button>
      </div>
    </div>
  </template>
  <template v-else>
    <p v-if="!researched.length" class="empty">尚未完成科技研究。</p>
    <div v-else class="completed-tech-scroll" aria-label="已研究科技依赖图">
      <div class="completed-tech-tree" :style="{ width: `${tree.width}px`, height: `${tree.height}px` }">
        <svg class="tech-connections" :width="tree.width" :height="tree.height" aria-hidden="true">
          <path v-for="edge in tree.edges" :key="edge.id" :data-tech-edge="edge.id" :d="edge.path" :style="{ stroke: edge.stroke }" :stroke-dasharray="edge.dash || undefined" />
        </svg>
        <div v-for="level in tree.levels" :key="level.tier" class="tech-tier-label" :data-tech-tier="level.tier" :style="{ top: `${level.y}px` }">{{ level.tier < 0 ? '特殊' : `T${level.tier}` }}</div>
        <div v-for="node in tree.nodes" :key="node.id" class="completed-tech-node" :style="{ left: `${node.x}px`, top: `${node.y}px` }">
          <button class="building-button tech-button" :class="{ 'is-key-tech': KEY_TECHNOLOGIES.has(node.id) }" :data-completed-tech="node.id" :data-building-tip="node.id" data-tip-kind="tech"><span class="building-name">{{ TECHNOLOGIES[node.id].name }}</span><span class="building-pending">已研究</span></button>
        </div>
      </div>
    </div>
  </template>
</template>
