<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameState } from '../../types/state';
import { ACHIEVEMENTS } from '../../data/progression';

const props = defineProps<{ state: GameState; revision: number }>();
type AchievementFilter = 'all' | 'incomplete' | 'complete';
const selectedFilter = ref<AchievementFilter>('all');
const filters: { id: AchievementFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'incomplete', label: '未完成' },
  { id: 'complete', label: '已完成' },
];
const entries = computed(() => {
  props.revision;
  return (Object.keys(ACHIEVEMENTS) as (keyof typeof ACHIEVEMENTS)[])
    .map(id => ({ id, definition: ACHIEVEMENTS[id], earned: props.state.achievements.includes(id) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned));
});
const earnedCount = computed(() => { props.revision; return entries.value.filter(e => e.earned).length; });
const visibleEntries = computed(() => entries.value.filter(entry =>
  selectedFilter.value === 'all' || entry.earned === (selectedFilter.value === 'complete'),
));
</script>

<template>
  <div class="settings">
    <section>
      <h3>成就 <span class="subtle">{{ earnedCount }} / {{ entries.length }}</span></h3>
      <p class="small subtle">更新后新达成条件即可获得成就；普通重置保留成就，硬重置会清空。</p>
      <nav class="achievement-filters" aria-label="成就筛选">
        <button v-for="filter in filters" :key="filter.id" type="button" :data-achievement-filter="filter.id" :aria-pressed="selectedFilter === filter.id" @click="selectedFilter = filter.id">{{ filter.label }}</button>
      </nav>
    </section>
  </div>
  <p v-if="!visibleEntries.length" class="small subtle" role="status">暂无符合筛选条件的成就。</p>
  <div v-else class="detail-grid">
    <article v-for="entry in visibleEntries" :key="entry.id" class="card" :data-achievement="entry.id" :class="{ 'is-earned': entry.earned }">
      <div class="card-top">
        <span class="icon">{{ entry.definition.icon }}</span>
        <div class="card-title"><h3>{{ entry.definition.name }}</h3></div>
        <span :class="entry.earned ? 'check' : 'subtle'" class="small">{{ entry.earned ? '✓ 已达成' : '未达成' }}</span>
      </div>
      <p class="desc">{{ entry.definition.desc }}</p>
    </article>
  </div>
</template>

<style scoped>
.achievement-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.achievement-filters button[aria-pressed="true"] { border-color: #63b875; }
</style>
