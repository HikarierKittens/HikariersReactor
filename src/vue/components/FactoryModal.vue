<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { FactoryLineId } from '../../types/economy';
import { RESOURCES, FACTORY_OPTIONS } from '../../data/resources';
import { calculateFactoryRecipe, calculateFactoryCapacity, countAssignedLines } from '../../simulation/factory';
import { isFactoryLineUnlocked } from '../../simulation/factory-settlement';
import { clickMultiplier, fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ assign: [id: FactoryLineId, delta: number] }>();

const cap = computed(() => { props.revision; return calculateFactoryCapacity(props.state); });
const used = computed(() => { props.revision; return countAssignedLines(props.state); });
const rows = computed(() => {
  props.revision;
  return FACTORY_OPTIONS.filter(opt => isFactoryLineUnlocked(opt.id, props.state)).map(opt => {
    const count = props.state.lines[opt.id] || 0;
    const recipe = calculateFactoryRecipe(opt.id, props.state);
    const inputs = Object.entries(recipe.input).map(([r, v]) =>
      `${RESOURCES[r as keyof typeof RESOURCES].name} ${Number(v.toPrecision(12))}/s`).join(' + ');
    const outputs = Object.entries(recipe.output).map(([r, v]) =>
      `${RESOURCES[r as keyof typeof RESOURCES].name} ${Number(v.toPrecision(12))}/s`).join(' + ');
    return {
      id: opt.id,
      name: RESOURCES[opt.id].name,
      count,
      locked: !isFactoryLineUnlocked(opt.id, props.state),
      recipe: `每条生产线当前配方：${inputs} → ${outputs}。`,
    };
  });
});
</script>

<template>
  <div id="factoryBody">
    <p class="factory-ops">生产线: {{ fmt(used) }} / {{ fmt(cap) }} · 空闲 {{ fmt(Math.max(0, cap - used)) }}</p>
    <p v-if="!cap" class="empty">建造地面工厂、太空工厂或高科技工厂后获得生产线容量。</p>
    <div class="factory-rows">
      <div v-for="row in rows" :key="row.id" class="factory-row" :data-recipe="row.recipe">
        <span class="factory-name" :data-tip="row.recipe" tabindex="0" :aria-label="`${row.name}生产线配方：${row.recipe}${row.locked ? '尚未解锁' : ''}`">{{ row.name }}<span v-if="row.locked" class="small subtle">（未解锁）</span></span>
        <button :data-line-option="row.id" :data-line-delta="-1" :disabled="row.count <= 0" :aria-label="`减少${row.name}生产线`" @click="emit('assign', row.id, -clickMultiplier($event))">«</button>
        <strong>{{ fmt(row.count) }}</strong>
        <button :data-line-option="row.id" :data-line-delta="1" :disabled="row.locked || used >= cap" :aria-label="`增加${row.name}生产线`" @click="emit('assign', row.id, clickMultiplier($event))">»</button>
      </div>
    </div>
  </div>
</template>
