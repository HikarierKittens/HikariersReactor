<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import { listActivePerks } from '../../simulation/perks';

const props = defineProps<{ state: GameState; revision: number }>();
const perks = computed(() => { props.revision; return listActivePerks(props.state); });
</script>

<template>
  <div class="perk-list">
    <article v-for="perk in perks" :key="`${perk.source}-${perk.id}`" class="perk-card" :data-perk="perk.id" :data-perk-source="perk.source">
      <h3 class="perk-name">{{ perk.name }}<span class="perk-source">{{ perk.source === 'crispr' ? 'CRISPR' : '成就' }}</span></h3>
      <p v-for="(line, index) in perk.lines" :key="index" class="perk-line" :class="{ 'perk-current': index > 0 }">{{ line }}</p>
    </article>
    <p v-if="!perks.length" class="empty">暂无特权。购买CRISPR升级或达成带有特殊效果的成就后，会在这里显示。</p>
  </div>
</template>

<style scoped>
.perk-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.perk-card { padding: 4px 10px; border: 1px solid var(--line); border-radius: 2px; text-align: left; }
.perk-name { margin: 0; font-size: 14px; font-weight: 400; color: var(--gold); line-height: 1.6; }
.perk-source { margin-left: 8px; font-size: 11px; color: var(--muted); }
.perk-line { margin: 0; font-size: 13px; line-height: 1.6; }
.perk-current { color: var(--green); }
</style>
