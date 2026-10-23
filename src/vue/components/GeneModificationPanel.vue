<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { DnaId, GameState, GeneId } from '../../types/state';
import { DNA_BASE_IDS, DNA_KNOWLEDGE_COST, GENE_DEFINITIONS } from '../../data/genes';
import { MAX_GENE_LEVEL, calculateGeneUpgradeCost, geneBonus, geneExtraBonus } from '../../simulation/genes';
import { clickMultiplier, fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ craft: [id: DnaId, count: number]; upgrade: [id: GeneId] }>();

// Live hotkey preview, matching the manual crafting panel.
const multiplier = ref(1);
function keys(event: KeyboardEvent): void { multiplier.value = clickMultiplier(event); }
function clear(): void { multiplier.value = 1; }
function visibility(): void { if (document.hidden) clear(); }
onMounted(() => {
  window.addEventListener('keydown', keys); window.addEventListener('keyup', keys);
  window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility);
});
onUnmounted(() => {
  window.removeEventListener('keydown', keys); window.removeEventListener('keyup', keys);
  window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility);
});

const knowledge = computed(() => { props.revision; return props.state.resources.knowledge; });
const dna = computed(() => { props.revision; return { ...props.state.geneModification.dna }; });
const groups = computed(() => {
  props.revision;
  return DNA_BASE_IDS.map(base => ({
    base,
    genes: (Object.keys(GENE_DEFINITIONS) as GeneId[]).filter(id => GENE_DEFINITIONS[id].dna === base).map(id => {
      const level = props.state.geneModification.levels[id];
      const cost = calculateGeneUpgradeCost(props.state, id);
      const maxed = level >= MAX_GENE_LEVEL;
      const definition = GENE_DEFINITIONS[id];
      const bonuses = [
        `${definition.label ?? '当前加成'} +${percent(geneBonus(props.state, id))}`,
        ...(definition.extra ? [`${definition.extra.label} +${percent(geneExtraBonus(props.state, id))}`] : []),
      ];
      return { id, ...definition, level, cost, maxed, bonuses, affordable: !maxed && props.state.geneModification.dna[base] >= cost };
    }),
  }));
});
function percent(value: number): string { return `${Number((value * 100).toFixed(2))}%`; }
</script>

<template>
  <section id="geneModification" class="gene-modification" aria-labelledby="geneModificationTitle">
    <h3 id="geneModificationTitle">基因修饰</h3>
    <p class="small subtle">消耗 {{ fmt(DNA_KNOWLEDGE_COST) }} 知识制造一个碱基，用对应碱基升级基因；本周目内有效，重置后清零。制造按钮支持 Ctrl ×10、Shift ×25、Alt ×100。</p>
    <div class="actions dna-craft">
      <button v-for="base in DNA_BASE_IDS" :key="base" :data-dna-craft="base" :disabled="knowledge + 1e-8 < DNA_KNOWLEDGE_COST"
        :aria-label="`消耗${fmt(DNA_KNOWLEDGE_COST * multiplier)}知识制造${multiplier}个${base}`" @click="emit('craft', base, clickMultiplier($event))">制造 {{ base }} ×{{ multiplier }}</button>
    </div>
    <div v-for="group in groups" :key="group.base" class="gene-group" :data-gene-group="group.base">
      <h4>{{ group.base }} 类基因 <span class="subtle small">持有 {{ fmt(dna[group.base]) }}</span></h4>
      <div class="gene-grid">
        <article v-for="gene in group.genes" :key="gene.id" class="card gene-card" :data-gene="gene.id">
          <h3 class="gene-title">{{ gene.name }} <span class="count" :data-gene-level="gene.id">Lv.{{ gene.level }}</span></h3>
          <p class="gene-desc">{{ gene.desc }}</p>
          <p v-for="bonus in gene.bonuses" :key="bonus" class="gene-bonus small subtle">{{ bonus }}</p>
          <div class="gene-bottom">
            <span v-if="!gene.maxed" class="cost small" :class="{ negative: !gene.affordable }" :data-gene-cost="gene.cost">{{ fmt(gene.cost) }} {{ group.base }}</span>
            <span v-else class="small subtle">已满级</span>
            <button :data-gene-upgrade="gene.id" :disabled="!gene.affordable" :aria-label="`升级${gene.name}，消耗${gene.cost}个${group.base}`" @click="emit('upgrade', gene.id)">升级</button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.gene-modification { margin-top: 12px; }
.gene-modification h4 { margin: 8px 0 4px; font-weight: 400; color: var(--gold); }
.dna-craft { flex-wrap: wrap; margin-bottom: 4px; }
/* Each DNA base owns its grid, so different gene types never share a row; unused columns stay empty. */
.gene-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.gene-card { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding: 4px 6px; overflow-wrap: anywhere; }
.gene-title { margin: 0; font-size: 12px; font-weight: 400; line-height: 1.3; }
.gene-desc { margin: 0; flex: 1; font-size: 11px; line-height: 1.3; color: var(--muted); }
.gene-bonus { margin: 0; font-size: 11px; line-height: 1.3; }
.gene-bottom { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 1px; }
.gene-bottom .cost { margin: 0; font-size: 11px; }
.gene-bottom button { padding: 1px 8px; font-size: 12px; }
/* Fall back to 2 columns only when the panel itself is too narrow for 4 readable cards. */
.gene-modification { container-type: inline-size; }
@container (max-width: 520px) { .gene-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
