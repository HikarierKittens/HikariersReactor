<script setup lang="ts">
import { computed } from 'vue';
import type { DnaId, GameState } from '../../types/state';
import { DNA_BASE_IDS, DNA_KNOWLEDGE_COST } from '../../data/genes';
import { MAX_GENE_SYNTHESIS_RATE, MAX_GENE_SYNTHESIS_TOTAL, calculateSynthesisedDna, remainingGeneSynthesisBudget, totalGeneSynthesisRate } from '../../simulation/genes';
import { uiPreview } from '../preview-cache';
import { fmt } from '../format';
import { signedRate } from '../../simulation/resource-breakdown';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ rate: [id: DnaId, value: number] }>();

const settled = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).geneSynthesis; });
const labs = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).inputUnits.biologyLab || 0; });
const total = computed(() => { props.revision; return totalGeneSynthesisRate(props.state); });
// Knowledge actually flowing in this settlement after dl.exe diversion; the sliders
// split this pool, so the preview follows real production instead of a fixed rate.
const producedKnowledge = computed(() => settled.value?.knowledgeProduction || 0);
const rows = computed(() => {
  props.revision;
  return DNA_BASE_IDS.map(id => {
    const rate = props.state.geneModification.synthesis[id];
    return {
      id, rate,
      cap: remainingGeneSynthesisBudget(props.state, id),
      // Share of incoming knowledge this base takes, and its DNA yield per second.
      knowledge: producedKnowledge.value * rate / 100,
      dna: calculateSynthesisedDna(props.state, producedKnowledge.value, rate),
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
    <p class="factory-ops">运行中的生物科学实验室：{{ fmt(labs) }} · 总比例 {{ fmt(total) }}% / {{ MAX_GENE_SYNTHESIS_TOTAL }}% · 当前知识消耗 {{ fmt(totalKnowledge) }}/s</p>
    <p class="small subtle">按比例抽取当前知识产出（与 dl.exe 相同，不动用库存）。4 个滑条共享 100%：提高一项会占用其余项的额度。每 1 个碱基固定消耗 {{ fmt(DNA_KNOWLEDGE_COST) }} 知识，转化比例不变。</p>
    <div class="synthesis-rows">
      <div v-for="row in rows" :key="row.id" class="synthesis-row" :data-synthesis-row="row.id">
        <label :for="`geneSynthesis${row.id}`">碱基 {{ row.id }}</label>
        <input :id="`geneSynthesis${row.id}`" type="range" min="0" :max="MAX_GENE_SYNTHESIS_RATE" step="1" :value="row.rate"
          :data-synthesis-rate="row.id" :data-synthesis-cap="row.cap" :aria-valuetext="`${row.rate}%`" @input="setRate(row.id, $event)">
        <strong :data-synthesis-value="row.id">{{ row.rate }}%</strong>
        <span class="small subtle">占产出 {{ fmt(row.knowledge) }} 知识/s → {{ fmt(row.dna) }} {{ row.id }}/s · 实际 {{ signedRate(row.actual) }}/s</span>
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
