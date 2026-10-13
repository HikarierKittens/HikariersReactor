<script setup lang="ts">
import { computed } from 'vue';
import type { GameState } from '../../types/state';
import type { ResourceId } from '../../types/economy';
import { RESOURCES } from '../../data/resources';
import { uiPreview } from '../preview-cache';
import { signedRate } from '../../simulation/resource-breakdown';
import { fmt, storageCap, resourceUnlocked } from '../format';

const RESOURCE_ORDER: ResourceId[] = ['cash', 'food', 'wood', 'stone', 'fur', 'copper', 'iron', 'aluminum', 'cement', 'coal', 'oil', 'metal', 'titanium', 'uranium', 'alloy', 'polymer', 'iridium', 'helium3', 'deuterium', 'neutron', 'e710', 'water', 'nanotubes'];
const resourceRank = (id: ResourceId) => RESOURCE_ORDER.includes(id) ? RESOURCE_ORDER.indexOf(id) : RESOURCE_ORDER.length;

const props = defineProps<{ state: GameState; revision: number }>();
const production = computed(() => { props.revision; return uiPreview.production(props.state, props.revision); });
const groups = computed(() => {
  props.revision;
  const rows = (Object.keys(RESOURCES) as ResourceId[])
    .filter(id => !RESOURCES[id].crafted && resourceUnlocked(id, props.state))
    .map(id => {
      const cap = storageCap(id, props.state, props.revision);
      return { id, ...RESOURCES[id], amount: props.state.resources[id], cap,
        rate: production.value.rates[id], fill: cap > 0 ? Math.max(0, Math.min(100, props.state.resources[id] / cap * 100)) : 0 };
    });
  return [
    { id: 'specialResources', name: '特殊资源', rows: rows.filter(row => row.special) },
    { id: 'resources', name: '资源', rows: rows.filter(row => !row.special).sort((a, b) => resourceRank(a.id) - resourceRank(b.id)) },
  ].filter(group => group.rows.length);
});
</script>

<template>
  <section class="panel">
    <template v-for="group in groups" :key="group.id">
      <div class="panel-head"><h2>{{ group.name }}</h2><span>数量 / 上限 · 产量</span></div>
      <div :id="group.id" class="res-list">
        <div v-for="row in group.rows" :key="row.id" class="res-row" :data-resource-id="row.id">
          <span class="res-name">{{ row.name }}</span>
          <span class="res-amount" tabindex="0" :data-building-tip="row.id" data-tip-kind="storage" :aria-label="`查看${row.name}储量明细`">
            <b>{{ fmt(row.amount) }}</b><i>/ {{ fmt(row.cap) }}</i>
          </span>
          <span class="res-rate" :class="{ 'is-deficit': row.rate < 0 }" tabindex="0" :data-building-tip="row.id" data-tip-kind="resource" :aria-label="`查看${row.name}每秒收支明细`">{{ signedRate(row.rate) }}</span>
          <span class="res-fill" :style="{ width: `${row.fill}%` }"></span>
        </div>
      </div>
    </template>
  </section>
</template>
