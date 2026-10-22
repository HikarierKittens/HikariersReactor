<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GameState } from '../../types/state';
import { ACHIEVEMENTS, ACHIEVEMENT_MASTERY_PER_GRADE } from '../../data/progression';
import { getAchievementLevel } from '../../simulation/achievement-tracking';
import { percent } from '../format';

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
    .map(id => ({ id, definition: ACHIEVEMENTS[id], earned: props.state.achievements.includes(id), level: getAchievementLevel(props.state, id) ?? 0 }))
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
      <h3>Tips</h3>
      <ul class="small subtle achievement-tips">
        <li>每个成就在完成时都会获得等级。除非额外说明，等级为0～3级，取决于完成时本周目已激活的挑战基因数量，每激活一个等级+1，最高3级。</li>
        <li>每个已完成成就按等级分别提供0.25% / 0.5% / 0.75% / 1%的全局产量加成，称为精通。精通也在特权页面显示；如无特殊说明，对除电力外所有资源生效，包括锻造物。</li>
        <li>已完成成就可在更高挑战等级下再次完成并升级；高等级覆盖低等级。同一成就的精通及特权不按等级累加，不同成就的精通相加。</li>
        <li>部分成就提供特权，特权加成也与对应成就等级有关，只采用当前最高等级效果。</li>
      </ul>
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
        <div class="card-title"><h3>{{ entry.definition.name }}</h3></div>
        <span :class="entry.earned ? 'check' : 'subtle'" class="small">{{ entry.earned ? '已达成' : '未达成' }}</span>
      </div>
      <p class="desc">{{ entry.definition.desc }}</p>
      <p v-if="entry.earned" class="small check" :data-achievement-level="entry.level">等级 {{ entry.level }} · 精通 +{{ percent((entry.level + 1) * ACHIEVEMENT_MASTERY_PER_GRADE * 100) }}%</p>
    </article>
  </div>
</template>

<style scoped>
.achievement-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.achievement-filters button[aria-pressed="true"] { border-color: #63b875; }
</style>
