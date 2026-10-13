<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import { calculateGrowthMultiplier } from '../../simulation/population';
import { uiPreview } from '../preview-cache';
import { capacity, fmt, moraleSnapshot, percent } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const population = computed(() => { props.revision; return props.state.population; });
const cap = computed(() => { props.revision; return capacity(props.state, props.revision); });
const morale = computed(() => { props.revision; return moraleSnapshot(props.state, 1, props.revision); });
const foodRate = computed(() => { props.revision; return uiPreview.production(props.state, props.revision).rates.food; });
const growthRatio = computed(() => {
  props.revision;
  return Math.max(0, Math.min(100, (props.state.growth / (props.state.growthTarget || 1)) * 100));
});
const happyRatio = computed(() => {
  props.revision;
  return Math.max(0, Math.min(100, (morale.value.happiness / (morale.value.cap || 100)) * 100));
});
const growthHint = computed(() => {
  props.revision;
  if (population.value >= cap.value) return '家园已满';
  if (props.state.resources.food <= 0) return '等待猫粮';
  if (foodRate.value < -1e-8) return '猫粮收支不足';
  if (!props.state.growthTarget) return '等待猫猫到来';
  return '约 ' + Math.ceil(Math.max(0, props.state.growthTarget - props.state.growth) / calculateGrowthMultiplier(props.state)) + ' s +1';
});
</script>

<template>
  <section class="panel">
    <div class="panel-head"><h2>文明</h2><span id="vitalHint">猫口与幸福度</span></div>
    <div id="civilizationResources" class="res-list">
      <div class="res-row">
        <span class="res-name">猫口</span>
        <span class="res-amount" tabindex="0" data-building-tip="population" data-tip-kind="housing" aria-label="查看猫口容量明细"><b>{{ fmt(population) }} / {{ fmt(cap) }}</b></span>
        <span class="res-rate subtle">{{ growthHint }}</span>
        <span class="res-fill" :style="{ width: growthRatio + '%' }"></span>
      </div>
      <div class="res-row">
        <span class="res-name">幸福度</span>
        <span class="res-amount" tabindex="0" data-building-tip="happiness" data-tip-kind="morale" aria-label="查看幸福度明细"><b>{{ percent(morale.happiness) }}%</b></span>
        <span class="res-rate subtle">上限 {{ percent(morale.cap) }}%</span>
        <span class="res-fill" :style="{ width: happyRatio + '%' }"></span>
      </div>
    </div>
  </section>
</template>
