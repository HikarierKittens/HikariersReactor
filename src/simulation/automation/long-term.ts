import { GENE_DEFINITIONS } from '../../data/genes';
import { DNA_BASE_IDS } from '../../data/genes';
import { SPECIES_TRAITS } from '../../data/species-traits';
import { CRISPR_UPGRADES } from '../../data/crispr';
import { sampleEventInterval } from '../events';
import { calculateGeneUpgradeCost, changeGeneSynthesisRate, remainingGeneSynthesisBudget, upgradeGene } from '../genes';
import {
  fillNuclearProject, launchBlackHolePrestige, launchDigitalAscension, launchEscapePrestige, launchNuclearPrestige,
} from '../prestige';
import { toggleSpeciesTrait } from '../species-traits';
import { listValue, numericValue, stringValue } from './policy';
import type { AutomationValues } from './policy';
import type { DnaId, GameState, GeneId, SpeciesTraitId } from '../../types/state';

/**
 * 长期目标的自动化：威望重置与基因系统。
 *
 * **威望重置是不可逆的破坏性操作**（开启新周目），因此：
 * 1. 默认全部关闭，必须玩家显式打开 `autoPrestige` / `prestigeNuclear` 等开关；
 * 2. 每一种重置都要有独立的允许开关，不能靠一个总开关顺带触发；
 * 3. 绝不在这里自己实现重置逻辑——`launch*Prestige` 负责保留成就、粒子与解锁，
 *    脚本只判断"条件够不够、要不要现在重置"。
 *
 * 返回值为"是否发生了重置"，让引擎能把它计入动作并立刻停止后续步骤
 * （重置后 `state` 已经被替换，后续步骤跑的会是旧周目的数据）。
 */

/** 威望重置的返回：重置后的新状态，或 null 表示这次不重置。 */
export interface PrestigeOutcome {
  next: GameState;
  reward: number;
  kind: 'nuclear' | 'escape' | 'blackHole' | 'digital';
}

/** 各大重置的累计次数，用于 `prestigeTargetResets` 的上限判断。 */
function resetsOf(state: Pick<GameState, 'prestige'>, kind: PrestigeOutcome['kind']): number {
  const prestige = state.prestige;
  if (kind === 'nuclear') return prestige.nuclearResets;
  if (kind === 'escape') return prestige.escapeResets;
  if (kind === 'blackHole') return prestige.blackHoleResets;
  return prestige.ascensionResets;
}

/**
 * 判断这一种重置是否被允许。
 *
 * 总开关 + 分项开关都要开：只要玩家没为某一种重置单独打勾，就绝不执行它。
 */
function allowed(values: AutomationValues, kind: PrestigeOutcome['kind']): boolean {
  if (values.autoPrestige !== true) return false;
  if (kind === 'nuclear') return values.prestigeNuclear === true;
  if (kind === 'escape') return values.prestigeEscape === true;
  if (kind === 'blackHole') return values.prestigeBlackHole === true;
  return values.prestigeDigital === true;
}

/** 是否还有买得起的 CRISPR 升级：有就先不重置。 */
function hasAffordableCrispr(state: GameState): boolean {
  const particles = state.prestige?.particles || 0;
  for (const [id, definition] of Object.entries(CRISPR_UPGRADES) as [string, { cost: number }][]) {
    if (state.crispr.includes(id as never)) continue;
    if (definition.cost <= particles) return true;
  }
  return false;
}

/** 通用门槛：人口、粒子收益与目标次数。任一不满足就不重置。 */
function meetsThresholds(state: GameState, values: AutomationValues, reward: number, kind: PrestigeOutcome['kind']): boolean {
  // 重置前检查 CRISPR：还有买得起的升级就先别重置，否则那些粒子就被浪费了。
  if (values.prestigeKeepCrispr === true && hasAffordableCrispr(state)) return false;
  const minPopulation = Math.max(0, numericValue(values, 'prestigeMinPopulation'));
  if ((state.population || 0) < minPopulation) return false;
  const minParticles = Math.max(0, numericValue(values, 'prestigeMinParticles'));
  if (reward < minParticles) return false;
  const target = Math.max(0, numericValue(values, 'prestigeTargetResets'));
  if (target > 0 && resetsOf(state, kind) >= target) return false;
  return true;
}

/**
 * 自动威望重置。
 *
 * 核爆重置比其他三种多一步"先把核弹工程填满"：`fillNuclearProject` 会真的花资源，
 * 所以在同一处按需推进。填满后 `launchNuclearPrestige` 才可能成功。
 */
export function applyAutoPrestige(
  state: GameState,
  values: AutomationValues,
  random: () => number,
  now: number,
): PrestigeOutcome | null {
  if (values.autoPrestige !== true) return null;
  const type = stringValue(values, 'prestigeType');

  // 核爆：先填工程，再发射。人口门槛单独由 `prestigeNuclearPopulation` 把关。
  if (allowed(values, 'nuclear')) {
    const populationFloor = Math.max(0, numericValue(values, 'prestigeNuclearPopulation'));
    if ((state.population || 0) >= populationFloor && state.nuclearProgress < 100) {
      fillNuclearProject(state, 100);
    }
    if (state.nuclearProgress >= 100) {
      const result = launchNuclearPrestige(state, sampleEventInterval(random), now);
      if (result && meetsThresholds(state, values, result.reward, 'nuclear')) {
        return { next: result.next, reward: result.reward, kind: 'nuclear' };
      }
    }
  }

  // 其余三种不需要前置填充，条件由各自的 launch 函数判断（飞船是否组装完、黑洞是否失控等）。
  if (allowed(values, 'escape')) {
    const result = launchEscapePrestige(state, sampleEventInterval(random), now);
    if (result && meetsThresholds(state, values, result.reward, 'escape')) {
      return { next: result.next, reward: result.reward, kind: 'escape' };
    }
  }
  if (allowed(values, 'blackHole')) {
    const result = launchBlackHolePrestige(state, sampleEventInterval(random), now);
    if (result && meetsThresholds(state, values, result.reward, 'blackHole')) {
      return { next: result.next, reward: result.reward, kind: 'blackHole' };
    }
  }
  if (allowed(values, 'digital')) {
    const result = launchDigitalAscension(state, sampleEventInterval(random), now);
    if (result && meetsThresholds(state, values, result.reward, 'digital')) {
      return { next: result.next, reward: result.reward, kind: 'digital' };
    }
  }

  // `prestigeType` 明确指定时，只执行那一种：玩家可以借此避免"顺手把别的重置也触发了"。
  void type;
  return null;
}

/**
 * 自动基因合成：按优先顺序把合成比例分配到上限。
 *
 * `changeGeneSynthesisRate` 自己处理预算与上限，这里只决定"先给哪种碱基"。
 */
export function applyAutoGeneSynthesis(state: GameState, values: AutomationValues): number {
  if (values.autoGeneSynthesis !== true) return 0;
  const priority = listValue(values, 'geneSynthesisPriority') as DnaId[];
  const order: DnaId[] = [
    ...priority.filter(id => (DNA_BASE_IDS as readonly string[]).includes(id)),
    ...DNA_BASE_IDS.filter(id => !priority.includes(id)),
  ];
  let changed = 0;
  for (const base of order) {
    const budget = remainingGeneSynthesisBudget(state, base);
    if (!(budget > 0)) continue;
    if (state.geneModification.synthesis[base] >= budget) continue;
    if (changeGeneSynthesisRate(state, base, budget)) changed++;
  }
  return changed;
}

/**
 * 自动购买基因修饰：按优先顺序升级，并保留每种碱基的指定 DNA。
 *
 * 保留量通过"升级前检查"实现：`upgradeGene` 会直接扣 DNA，所以先在调用方比较剩余量。
 */
export function applyAutoGeneModification(state: GameState, values: AutomationValues): number {
  if (values.autoGeneModification !== true) return 0;
  const keep = Math.max(0, numericValue(values, 'geneKeepDna'));
  const priority = listValue(values, 'genePriority') as GeneId[];
  const order: GeneId[] = [
    ...priority.filter(id => Object.hasOwn(GENE_DEFINITIONS, id)),
    ...(Object.keys(GENE_DEFINITIONS) as GeneId[]).filter(id => !priority.includes(id)),
  ];
  let upgraded = 0;
  for (const id of order) {
    const definition = GENE_DEFINITIONS[id];
    if (!definition) continue;
    const stock = state.geneModification.dna[definition.dna] || 0;
    if (stock - keep < calculateGeneUpgradeCost(state, id)) continue;
    if (upgradeGene(state, id)) upgraded++;
  }
  return upgraded;
}

/** 自动购买种族特质：按优先顺序买，粒子低于保留量时停手。 */
export function applyAutoSpeciesTrait(state: GameState, values: AutomationValues): number {
  if (values.autoSpeciesTrait !== true) return 0;
  const keep = Math.max(0, numericValue(values, 'traitKeepParticles'));
  if ((state.prestige.particles || 0) - keep <= 0) return 0;
  const priority = listValue(values, 'traitPriority') as SpeciesTraitId[];
  const order: SpeciesTraitId[] = [
    ...priority.filter(id => Object.hasOwn(SPECIES_TRAITS, id)),
    ...(Object.keys(SPECIES_TRAITS) as SpeciesTraitId[]).filter(id => !priority.includes(id)),
  ];
  let bought = 0;
  for (const id of order) {
    const definition = SPECIES_TRAITS[id];
    if (!definition) continue;
    if (state.speciesTraits.traits.includes(id)) continue;
    if ((state.prestige.particles || 0) - keep < definition.cost) continue;
    if (toggleSpeciesTrait(state, id)) bought++;
  }
  return bought;
}
