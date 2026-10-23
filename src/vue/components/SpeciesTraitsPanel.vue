<script setup lang="ts">
import { computed } from 'vue';
import type { GameState, SpeciesTraitId } from '../../types/state';
import { SPECIES, SPECIES_TRAITS, SPECIES_TRAIT_CAP } from '../../data/species-traits';
import { CURRENT_SPECIES, canAddSpeciesTrait, canRemoveSpeciesTrait, ownedSpeciesTraits, speciesTraitCount } from '../../simulation/species-traits';
import { fmt } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
const emit = defineEmits<{ toggle: [id: SpeciesTraitId] }>();

const species = computed(() => { props.revision; return SPECIES[CURRENT_SPECIES]; });
const owned = computed(() => { props.revision; return ownedSpeciesTraits(props.state); });
const count = computed(() => { props.revision; return speciesTraitCount(props.state); });
const full = computed(() => count.value >= SPECIES_TRAIT_CAP);

const ownedRows = computed(() => {
  props.revision;
  return owned.value.map(id => ({ id, ...SPECIES_TRAITS[id], removable: canRemoveSpeciesTrait(props.state, id) }));
});
// Every trait that is not owned yet; traits can always be bought back after removal.
const buyableRows = computed(() => {
  props.revision;
  return (Object.keys(SPECIES_TRAITS) as SpeciesTraitId[])
    .filter(id => !owned.value.includes(id))
    .map(id => ({ id, ...SPECIES_TRAITS[id], affordable: canAddSpeciesTrait(props.state, id) }));
});
</script>

<template>
  <section id="speciesTraits" class="species-traits" aria-labelledby="speciesTraitsTitle">
    <h3 id="speciesTraitsTitle">种族特质</h3>
    <p class="small subtle">{{ species.name }} · 已拥有 {{ fmt(count) }} / {{ fmt(SPECIES_TRAIT_CAP) }}</p>
    <div class="trait-grid">
      <article v-for="trait in ownedRows" :key="trait.id" class="card trait-card" :data-trait="trait.id" :title="trait.desc">
        <h3 class="trait-title">{{ trait.name }}</h3>
        <div class="trait-bottom">
          <span class="cost small" :class="{ negative: !trait.removable }">{{ fmt(trait.cost) }} 粒子</span>
          <button :data-trait-remove="trait.id" :disabled="!trait.removable" :aria-label="`移除${trait.name}，消耗${trait.cost}粒子`" @click="emit('toggle', trait.id)">移除</button>
        </div>
      </article>
    </div>
  </section>
  <section class="species-traits" aria-labelledby="speciesTraitShopTitle">
    <h3 id="speciesTraitShopTitle">可购买的种族特质</h3>
    <div class="trait-grid">
      <article v-for="trait in buyableRows" :key="trait.id" class="card trait-card" :data-trait-shop="trait.id" :title="trait.desc">
        <h3 class="trait-title">{{ trait.name }}</h3>
        <div class="trait-bottom">
          <span class="cost small" :class="{ negative: !trait.affordable }">{{ fmt(trait.cost) }} 粒子</span>
          <button :data-trait-buy="trait.id" :disabled="!trait.affordable" :aria-label="`购买${trait.name}，消耗${trait.cost}粒子`" @click="emit('toggle', trait.id)">购买</button>
        </div>
      </article>
    </div>
    <p v-if="full" class="small subtle">已达到特质数量上限，移除一个特质后才能继续购买。</p>
  </section>
</template>

<style scoped>
.species-traits { margin-top: 16px; container-type: inline-size; }
.trait-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.trait-card { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 6px 8px; overflow-wrap: anywhere; }
.trait-title { margin: 0; font-size: 13px; font-weight: 400; line-height: 1.4; }
.trait-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 2px; }
.trait-bottom .cost { margin: 0; }
.trait-bottom button { padding: 2px 10px; }
@container (max-width: 520px) { .trait-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
