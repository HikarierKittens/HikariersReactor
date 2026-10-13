<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import { RESOURCES } from '../../data/resources';
import { calculateBuildingInput, calculateBuildingOutput } from '../../simulation/building-production';
import { calculateSmelterSlotCapacity, countSteelSmelterSlots } from '../../simulation/factory';
import { clickMultiplier, fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
// Positive delta assigns idle slots to 钢冶炼; negative returns them to idle.
const emit = defineEmits<{ assign: [delta: number] }>();

const cap = computed(() => { props.revision; return calculateSmelterSlotCapacity(props.state); });
const steel = computed(() => { props.revision; return countSteelSmelterSlots(props.state); });
const recipe = computed(() => {
  props.revision;
  const part = (entries: Record<string, number | undefined>) => Object.entries(entries).map(([r, v]) =>
    `${RESOURCES[r as keyof typeof RESOURCES].name} ${Number((v || 0).toPrecision(12))}/s`).join(' + ');
  return `每个工位当前配方：${part(calculateBuildingInput('smelter', props.state))} → ${part(calculateBuildingOutput('smelter', props.state))}。`;
});
</script>

<template>
  <div id="smelterBody">
    <p class="factory-ops">冶炼厂工位: {{ fmt(steel) }} / {{ fmt(cap) }} · 空闲 {{ fmt(Math.max(0, cap - steel)) }}</p>
    <p v-if="!cap" class="empty">建造冶炼厂或恒星熔炉后获得冶炼厂工位。</p>
    <div class="factory-rows">
      <div class="factory-row">
        <span class="factory-name" :data-tip="recipe" tabindex="0" :aria-label="`钢冶炼工位配方：${recipe}`">钢冶炼</span>
        <button data-smelter-option="metal" :data-smelter-delta="-1" :disabled="steel <= 0" aria-label="减少钢冶炼工位" @click="emit('assign', -clickMultiplier($event))">«</button>
        <strong>{{ fmt(steel) }}</strong>
        <button data-smelter-option="metal" :data-smelter-delta="1" :disabled="steel >= cap" aria-label="增加钢冶炼工位" @click="emit('assign', clickMultiplier($event))">»</button>
      </div>
    </div>
  </div>
</template>
