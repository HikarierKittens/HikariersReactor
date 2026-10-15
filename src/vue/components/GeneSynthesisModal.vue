<script setup lang="ts">
import { computed } from 'vue';
import type { DnaId, GameState } from '../../types/state';
import { DNA_BASE_IDS } from '../../data/genes';
import { GENE_SYNTHESIS_DNA_PER_PERCENT, GENE_SYNTHESIS_KNOWLEDGE_PER_PERCENT, MAX_GENE_SYNTHESIS_RATE } from '../../simulation/genes';
import { uiPreview } from '../preview-cache';
import { fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ rate: [id: DnaId, value: number] }>();

const settled = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).geneSynthesis; });
const labs = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).inputUnits.biologyLab || 0; });
const rows = computed(() => {
  props.revision;
  return DNA_BASE_IDS.map(id => {
    const rate = props.state.geneModification.synthesis[id];
    return {
      id, rate,
      // Planned per-lab figures at this rate, independent of current knowledge/power.
      knowledge: rate * GENE_SYNTHESIS_KNOWLEDGE_PER_PERCENT,
      dna: rate * GENE_SYNTHESIS_DNA_PER_PERCENT,
      actual: settled.value?.dna[id] || 0,
    };
  });
});
const totalKnowledge = computed(() => settled.value?.knowledge || 0);

function setRate(id: DnaId, event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  const value = Number(event.currentTarget.value);
  if (Number.isSafeInteger(value) && value >= 0 && value <= MAX_GENE_SYNTHESIS_RATE) emit('rate', id, value);
}
</script>

<template>
  <div id="geneSynthesisBody">
    <p class="factory-ops">运行中的生物科学实验室：{{ fmt(labs) }} · 当前知识消耗 {{ fmt(totalKnowledge) }}/s</p>
    <p class="small subtle">每座实验室在10%速率下每秒消耗20000知识，产出0.1对应碱基。4项速率互相独立，各自0%～100%；知识不足时按比例降速。</p>
    <div class="synthesis-rows">
      <div v-for="row in rows" :key="row.id" class="synthesis-row" :data-synthesis-row="row.id">
        <label :for="`geneSynthesis${row.id}`">碱基 {{ row.id }}</label>
        <input :id="`geneSynthesis${row.id}`" type="range" min="0" :max="MAX_GENE_SYNTHESIS_RATE" step="1" :value="row.rate"
          :data-synthesis-rate="row.id" :aria-valuetext="`${row.rate}%`" @input="setRate(row.id, $event)">
        <strong :data-synthesis-value="row.id">{{ row.rate }}%</strong>
        <span class="small subtle">每座：{{ fmt(row.knowledge) }}知识/s → {{ fmt(row.dna) }} {{ row.id }}/s · 实际 +{{ fmt(row.actual) }}/s</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.synthesis-rows { display: grid; gap: 8px; margin-top: 8px; }
.synthesis-row { display: grid; grid-template-columns: 4.5em minmax(120px, 1fr) 3.5em; align-items: center; gap: 4px 10px; }
.synthesis-row .small { grid-column: 1 / -1; }
.synthesis-row strong { text-align: right; font-variant-numeric: tabular-nums; }
</style>
