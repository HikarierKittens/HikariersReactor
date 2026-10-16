<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import { uiPreview } from '../preview-cache';
import { fmt } from '../format';
import { formatByteNumber } from '../../shared/format';
const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ allocation: [value: number] }>();
const digital = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).digital; });
function change(event: Event): void { emit('allocation', Number((event.target as HTMLInputElement).value)); }
</script>

<template>
  <div id="downloadBody">
    <p class="factory-ops">将知识产量的一部分分流为下载，不消耗已储存的知识。</p>
    <label class="download-allocation" for="downloadAllocation"><span>知识分流比例</span><strong data-download-allocation>{{ state.downloadAllocation }}%</strong></label>
    <input id="downloadAllocation" type="range" min="0" max="100" step="1" :value="state.downloadAllocation" :aria-valuetext="`${state.downloadAllocation}% 知识产量用于下载`" @input="change" />
    <div class="download-preview" aria-live="polite" data-download-preview>
      <p>分流前知识产量：<strong>{{ fmt(digital.knowledgeProduction) }}/s</strong></p>
      <p>实际分流知识：<strong>{{ fmt(digital.divertedKnowledge) }}/s</strong></p>
      <p>分流后知识产量：<strong>{{ fmt(Math.max(0, digital.knowledgeProduction - digital.divertedKnowledge)) }}/s</strong></p>
      <p>字节下载产量：<strong>{{ formatByteNumber(digital.byteProduction, true) }}/s</strong></p>
    </div>
    <p class="small subtle">0% 时不分流知识；100% 时将可用于下载的知识产量全部分流。实际下载受电力、带宽和下载缓存器影响；字节存储已满时，下载不会增加库存。</p>
  </div>
</template>

<style scoped>
.download-allocation { display: flex; justify-content: space-between; gap: 16px; margin: 18px 0 8px; }
#downloadAllocation { width: 100%; accent-color: var(--green); }
.download-preview { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 8px; font-variant-numeric: tabular-nums; }
.download-preview p { display: flex; justify-content: space-between; gap: 16px; }
</style>
