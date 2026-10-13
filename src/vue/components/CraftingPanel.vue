<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GameState } from '../../types/state';
import type { CraftId } from '../../types/economy';
import { CRAFT_RECIPES, RESOURCES } from '../../data/resources';
import { isResourceUnlocked } from '../../simulation/unlocks';
import { uiPreview } from '../preview-cache';
import { signedRate } from '../../simulation/resource-breakdown';
import { isChallengeGeneActive } from '../../simulation/challenges';
import { clickMultiplier, fmt } from '../format';
const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ craft: [id: CraftId, count: number | 'max'] }>();
const multiplier = ref(1);
const manualCraftDisabled = computed(() => {
  props.revision;
  return isChallengeGeneActive(props.state, 'industrialFracture');
});
function craft(id: CraftId, count: number | 'max'): void {
  if (manualCraftDisabled.value) return;
  emit('craft', id, count);
}
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
const rows = computed(() => {
  props.revision;
  const production = uiPreview.production(props.state, props.revision);
  return (Object.keys(CRAFT_RECIPES) as CraftId[]).filter(id => isResourceUnlocked(id, props.state)).map(id => ({
    id, name: RESOURCES[id].name, amount: props.state.resources[id],
    rate: production.outputs[`craft:${id}`] || 0,
  }));
});
</script>
<template>
  <section v-if="rows.length" id="craftedResources" class="panel">
    <div class="panel-head"><h2>锻造物</h2><span>手动制造</span></div>
    <div v-for="row in rows" :key="row.id" class="craft-row" :data-crafted-resource="row.id">
      <span class="craft-name">{{ row.name }} <b>{{ fmt(row.amount) }}</b></span>
      <span class="craft-actions">
        <span v-if="row.rate > 0" class="res-rate" tabindex="0" :data-building-tip="row.id" data-tip-kind="resource" :aria-label="`查看${row.name}工匠产量明细`">{{ signedRate(row.rate) }}</span>
        <button v-for="n in [1, 10, 100]" :key="n" :data-craft="row.id" :data-craft-count="n" :disabled="manualCraftDisabled" :title="manualCraftDisabled ? '禁用手动锻造' : undefined" :aria-label="manualCraftDisabled ? `${row.name}：禁用手动锻造` : `制造${row.name} ${n * multiplier}份`" @click="craft(row.id, n * clickMultiplier($event))">+{{ n * multiplier }}</button>
        <button :data-craft="row.id" data-craft-count="max" :disabled="manualCraftDisabled" :title="manualCraftDisabled ? '禁用手动锻造' : undefined" :aria-label="manualCraftDisabled ? `${row.name}：禁用手动锻造` : `制造全部可负担的${row.name}`" @click="craft(row.id, 'max')">+max</button>
      </span>
    </div>
  </section>
</template>
