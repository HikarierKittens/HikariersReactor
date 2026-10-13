<script setup lang="ts">
import { ref } from 'vue';
import type { ChallengeGeneId, GameState } from '../../types/state';
const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ launch: [genes: ChallengeGeneId[]] }>();
const selected = ref<ChallengeGeneId[]>([]);
const genes: { id: ChallengeGeneId; name: string; desc: string }[] = [
  { id: 'particleImbalance', name: '粒子失衡', desc: '开局已有粒子本周目不生效；后续获得的粒子正常生效。粒子加速器改为每座使普通资源（含知识）产量+5%，锻造物产量+1.25%。' },
  { id: 'geneCollapse', name: '基因崩坏', desc: 'CRISPR建筑成本递增率减免效果降为原来的五分之一。' },
  { id: 'industrialFracture', name: '工业破碎', desc: '禁用手动锻造。' },
];
function toggle(id: ChallengeGeneId): void { selected.value = selected.value.includes(id) ? selected.value.filter(gene => gene !== id) : [...selected.value, id]; }
</script>
<template>
  <div class="challenge-panel">
    <p class="small subtle">点选仅改变下次挑战的选择，不影响当前周目。启动挑战会软重置；通过设置中的软重置退出挑战。</p>
    <section><h3>挑战基因</h3>
      <div v-for="gene in genes" :key="gene.id" class="challenge-gene">
        <button :data-challenge-gene="gene.id" :aria-pressed="selected.includes(gene.id)" :class="{ active: selected.includes(gene.id) }" @click="toggle(gene.id)">{{ gene.name }} · {{ selected.includes(gene.id) ? '已选择' : '未选择' }}</button>
        <p class="small subtle">{{ gene.desc }}</p>
        <p v-if="props.state.challenge.genes.includes(gene.id)" class="small positive">当前周目已生效</p>
      </div>
    </section>
    <section><h3>挑战模式</h3><p class="small subtle">暂无可选模式</p></section>
    <section><h3>剧情模式</h3><p class="small subtle">暂无可选模式</p></section>
    <button id="launchChallenges" class="primary" :disabled="!selected.length" @click="emit('launch', [...selected])">启动挑战</button>
  </div>
</template>
<style scoped>
.challenge-panel button[aria-pressed="true"] { border-color: #63b875; }
.challenge-panel section { margin: 20px 0; }
.challenge-gene { margin: 12px 0; padding: 12px; border: 1px solid var(--border, #666256); }
.challenge-gene p { margin: 8px 0 0; }
</style>
