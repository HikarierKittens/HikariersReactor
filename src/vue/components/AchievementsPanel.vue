<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import { ACHIEVEMENTS } from '../../data/progression';

const props = defineProps<{ state: GameState; revision: number }>();
const entries = computed(() => {
  props.revision;
  return (Object.keys(ACHIEVEMENTS) as (keyof typeof ACHIEVEMENTS)[])
    .map(id => ({ id, definition: ACHIEVEMENTS[id], earned: props.state.achievements.includes(id) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned));
});
const earnedCount = computed(() => { props.revision; return entries.value.filter(e => e.earned).length; });
</script>

<template>
  <div class="settings">
    <section>
      <h3>成就 <span class="subtle">{{ earnedCount }} / {{ entries.length }}</span></h3>
      <p class="small subtle">达成条件在每次结算后自动检查；已有成就不会因普通结算撤销，硬重置会清空。</p>
    </section>
  </div>
  <div class="detail-grid">
    <article v-for="entry in entries" :key="entry.id" class="card" :data-achievement="entry.id" :class="{ 'is-earned': entry.earned }">
      <div class="card-top">
        <span class="icon">{{ entry.definition.icon }}</span>
        <div class="card-title"><h3>{{ entry.definition.name }}</h3></div>
        <span :class="entry.earned ? 'check' : 'subtle'" class="small">{{ entry.earned ? '✓ 已达成' : '未达成' }}</span>
      </div>
      <p class="desc">{{ entry.definition.desc }}</p>
    </article>
  </div>
</template>
