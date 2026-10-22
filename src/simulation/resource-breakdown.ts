import { HYPERSPACE_SOURCE_IDS, calculateHyperspaceOutputFactor, calculateHyperspaceLocalMultiplier } from './hyperspace-output';
import { calculateRefiningMultiplier, withPoweredMetalRefining } from './refining';
import { RESEARCH_SATELLITE_LAB_OUTPUT } from './building-effects';
import { calculateAiCementMultiplier, calculateAiGrapheneMultiplier } from './ai-data-center';
import { BUILDINGS } from '../data/buildings';
import { calculateQuantumManufacturingMultiplier } from './quantum';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../data/resources';
import { calculateBuildingName, calculateBuildingInput, calculateBuildingOutput, calculateToolMultiplier, calculateGrantedJobSlots } from './building-production';
import { calculateFactoryRecipe, calculateSmelterSlotCapacity, calculateRunningSmelterSlots } from './factory';
import { calculateHappinessMultiplier, calculateProductionMultiplier, calculateAluminumMultiplier, calculateKnowledgeMultiplier, calculateFactoryOutputMultiplier } from './multipliers';
import { calculateSpaceMultiplier, isSpaceResourceSource } from './asriel';
import { calculateParticleMultiplier, calculateGlobalOutputMultiplier, calculateMasteryMultiplier } from './crafting';
import { calculateChallengeAcceleratorMultiplier } from './multipliers';
import { calculateFoodPerCat } from './population';
import { soldierFoodUpkeep } from './neighbors';
import { activeOccupations, occupationOutputMultiplier, occupationTaxRate, unificationOutputMultiplier } from './neighbors';
/** Occupied cities that still count (always 0 after 世界统一). */
function activeOccupationCount(state: GameState): number {
  return activeOccupations(state).length;
}
import { SOLDIER_FOOD_UPKEEP } from '../data/neighbors';
import { SOLDIER_FUR_BASE } from '../data/military';
import { isPowerProducer } from './power';
import { countRunningBuildings } from './housing';
import { calculateGovernmentMultiplier, calculateTaxBase, calculateBankerMultiplier, soldierFurPerSoldier } from './government';
import { calculateForgingToolBonus, calculateOverclockCraftMultiplier, artisanCraftRate } from './crafting';
import { chipFactoryOutputMultiplier } from './chip-factory';
import { geneExtraBonus } from './genes';
import { CONFIG } from '../data/config';
import { formatRateNumber, formatByteNumber } from '../shared/format';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { GameState } from '../types/state';
import type { ProductionResult } from './production';
import type { DeepReadonly } from '../shared/readonly';

export interface BreakdownEntry {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  value: number;
  note: string;
}
export interface ResourceBreakdown {
  entries: BreakdownEntry[];
  income: number;
  expense: number;
  /**
   * `income + expense` — the settled flow. For `energy` this is
   * `generated - used`, i.e. what was actually generated and consumed. It is NOT
   * `ProductionResult.power.available`, which is the signed headroom
   * `generated - requested` and goes negative for enabled-but-unfunded loads.
   * The two are equal only when every enabled load received power.
   */
  net: number;
  /** Community centre doubles as a food-saving note in the expense tooltip. */
  communityCenter: boolean;
}

/** Per-resource income and expense rows, mirroring the settlement preview exactly. */
export function calculateResourceBreakdown(
  resource: ResourceId,
  state: GameState,
  result: DeepReadonly<ProductionResult>,
): ResourceBreakdown {
  return withPoweredMetalRefining(state, result.inputUnits.metalRefinery || 0, state => {
  const entries: BreakdownEntry[] = [];

  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (id === 'cpuDecoder') continue; // Fixed digital output is accounted separately, without global multipliers.
    const b = BUILDINGS[id];
    const n = id === 'smelter' ? calculateSmelterSlotCapacity(state) : state.buildings[id];
    if (!n && !b.unlimited) continue;
    const speed = (HYPERSPACE_SOURCE_IDS.includes(id)
      ? (result.inputUnits[id] || 0) * calculateHyperspaceOutputFactor(resource, state, result.morale.happiness, result.stageThree.ports, result.quantum.level) * calculateHyperspaceLocalMultiplier(id, state, result.inputUnits.adamantiteProcessor || 0)
      : result.outputs[id] || 0)
      * (isSpaceResourceSource(id) ? calculateSpaceMultiplier(id, state, result.asriel) : 1)
     
      * (['asrielMine', 'ecologicalDome'].includes(id)
        ? calculateProductionMultiplier(resource, result.morale.happiness, state) : 1);
    const workers = state.workers[id];
    const notes = b.workerOutput ? [`${b.workerName}岗位 ${workers} 个`] : id === 'smelter' ? [`钢冶炼工位 ${calculateRunningSmelterSlots(state)} 个`] : [`已建 ${n} 座`];
    if (b.boostResource && n) notes.push(`${calculateBuildingName(id, state)} ×${(1 + n * ((id === 'lumber' || id === 'quarry') ? .02 : .05)).toFixed(2)}`);
    if (b.morale) notes.push(`固定耗电，供能率 ${(result.morale.ratio * 100).toFixed(2)}%`);
    else if (!isPowerProducer(id) && Math.abs(result.morale.happiness - 100) > 1e-9) {
      notes.push(`幸福度 ×${calculateHappinessMultiplier(result.morale.happiness).toFixed(2)}`);
    }
    if (id === 'forage' && state.tech.includes('agriculture')) notes.push('农业 ×1.5');
    if (b.input) notes.push('已按可用原料调整开工量');

    const output = ['ethMiner', 'dataDecryptionModule', 'aesComputeModule', 'agiCoreComponent'].includes(id) ? 0 : calculateBuildingOutput(id, state, result.inputUnits)[resource];
    if (output) {
      const base = b.workerOutput
        ? (calculateBuildingOutput(id, state)[resource] || 0) * calculateToolMultiplier(id, state)
        : output;
      entries.push({
        // 冶炼厂 itself produces nothing; steel comes from the 冶炼厂工位 it grants.
        id, kind: 'income', name: `${id === 'smelter' ? '钢冶炼工位' : id === 'catCafe' && resource === 'cash' ? calculateBuildingName(id, state) : b.workerName || calculateBuildingName(id, state)}产出`,
        value: base * speed
          * (resource === 'aluminum' && !HYPERSPACE_SOURCE_IDS.includes(id) ? calculateAluminumMultiplier(state) : 1)
          * calculateGlobalOutputMultiplier(resource, state),
        note: notes.join(' · '),
      });
    }
    const input = calculateBuildingInput(id, state)[resource];
    if (input) {
      entries.push({
        id, kind: 'expense', name: `${id === 'smelter' ? '钢冶炼工位' : b.workerOutput ? b.workerName : calculateBuildingName(id, state)}消耗`,
        value: -input * (result.inputUnits[id] || 0),
        note: '固定基础消耗 × 实际工作数量（不乘产量加成）',
      });
    }
  }

  for (const opt of FACTORY_OPTIONS) {
    const units = state.lines[opt.id] || 0;
    if (!units) continue;
    const recipe = calculateFactoryRecipe(opt.id, state);
    const speed = result.outputs[opt.id] || 0;
    const note = `工厂生产线 ×${units}`;
    if (recipe.output?.[resource]) {
      const spaceShare = (result.inputUnits.spaceFactory || 0)
        / ((result.inputUnits.factory || 0) + (result.inputUnits.spaceFactory || 0)
          + (result.inputUnits.highTechFactory || 0) * (BUILDINGS.highTechFactory.lines || 0) || 1);
      const knowledge = calculateKnowledgeMultiplier(state, result.inputUnits.observatory || 0, result.digital);
      entries.push({
        id: opt.id, kind: 'income', name: `${opt.name}产出`,
        value: recipe.output[resource] * speed
          * calculateFactoryOutputMultiplier(resource, result.morale.happiness, state, knowledge)
          * calculateQuantumManufacturingMultiplier(state, resource, result.quantum.level)
          * (resource === 'energy' || resource === 'knowledge' ? 1
            : 1 + spaceShare * (calculateSpaceMultiplier('spaceFactory', state, result.asriel) - 1)),
        note,
      });
    }
    if (recipe.input?.[resource]) {
      entries.push({
        id: opt.id, kind: 'expense', name: `${opt.name}消耗`,
        value: -recipe.input[resource] * (result.inputUnits[opt.id] || 0),
        note: '固定基础消耗 × 实际开工生产线',
      });
    }
  }

  for (const id of Object.keys(CRAFT_RECIPES) as (keyof typeof CRAFT_RECIPES)[]) {
    const recipe = CRAFT_RECIPES[id];
    const amount = result.outputs[`craft:${id}`] || 0;
    if (resource === id) {
      entries.push({
        id: `craft:${id}`, kind: 'income', name: `${RESOURCES[id].name}工匠产出`, value: amount,
        note: `每位工匠 ${recipe.rate}/s（工匠大师使速率翻倍），应用技工、粒子与锻造工具加成`,
      });
    }
    if (recipe.input?.[resource]) {
      entries.push({
        id: `craft:${id}`, kind: 'expense', name: `${RESOURCES[id].name}工匠消耗`,
        value: -recipe.input[resource] * (result.inputUnits[`craft:${id}`] || 0),
        note: '按基础制造批次消耗原料，粒子不增加消耗',
      });
    }
  }

  if (resource === 'energy' && (result.inputUnits.cementMixer || 0) > 0) {
    entries.push({ id: 'cementMixer', kind: 'expense', name: '水泥搅拌机消耗', value: -2 * (result.inputUnits.cementMixer ?? 0), note: '每座实际供能工匠消耗 2 电力/s' });
  }
  if (resource === 'cash') {
    entries.push({ id: 'catTax', kind: 'income', name: '猫猫税收', value: result.outputs.catTax || 0, note: '每只猫在20%税率下基础1现金/s；银行家加成相加（每位5%，每个证券交易所+2%），幸福度、社区、政府、粒子独立相乘' });
  }
  if (resource === 'fur') {
    entries.push({ id: 'soldierFur', kind: 'income', name: '服役士兵采集', value: result.outputs.soldierFur || 0, note: '每位士兵 0.2 × 单兵战斗力^0.5 毛皮/s，再乘幸福度与全局倍率' });
  }
  if (resource === 'titanium' && state.tech.includes('titaniumSmelting')) {
    entries.push({ id: 'titaniumByproduct', kind: 'income', name: '冶炼厂副产钛', value: result.outputs.titaniumByproduct || 0, note: '钢基础产能的 10% × 实际运行数量 × 钛产量加成' });
  }
  if (resource === 'energy' && (result.inputUnits.automatedMining || 0) > 0) {
    entries.push({ id: 'automatedMining', kind: 'expense', name: '自动化采矿消耗', value: -(result.inputUnits.automatedMining ?? 0), note: '每座实际供能矿底消耗 1 电力/s' });
  }
  if (resource === 'energy' && (result.inputUnits.automatedCoalMining || 0) > 0) {
    entries.push({ id: 'automatedCoalMining', kind: 'expense', name: '自动化煤矿消耗', value: -(result.inputUnits.automatedCoalMining ?? 0), note: '每座实际供能煤矿消耗 1 电力/s' });
  }
  if (resource === 'energy' && (result.inputUnits.automatedLumber || 0) > 0) {
    entries.push({ id: 'automatedLumber', kind: 'expense', name: '自动化伐木场消耗', value: -(result.inputUnits.automatedLumber ?? 0), note: '每座实际供能伐木场消耗 1 电力/s' });
  }
  if (resource === 'energy' && (result.inputUnits.automatedQuarry || 0) > 0) {
    entries.push({ id: 'automatedQuarry', kind: 'expense', name: '自动化采石场消耗', value: -(result.inputUnits.automatedQuarry ?? 0), note: '每座实际供能采石场消耗 1 电力/s' });
  }
  if (resource === 'encryptedData' && result.digital.encryptedProduction) entries.push({ id: 'dataDecryptionModule', kind: 'income', name: '数据解密模块 / AES算力模块', value: result.digital.encryptedProduction, note: '（解密基础产出 + AES基础产出）× 解密模块加成 × 幸福度 × 粒子及其他产量倍率' });
  if (resource === 'cash' && result.digital.minerProduction) entries.push({ id: 'ethMiner', kind: 'income', name: 'eth_miner', value: result.digital.minerProduction, note: '512/s × 有效运行数量 × 资金产量倍率' });
  if (resource === 'bytes' && result.digital.decoderProduction) entries.push({ id: 'cpuDecoder', kind: 'income', name: 'CPU解码器', value: result.digital.decoderProduction, note: '100B/s × 获得带宽和CPU支持的数量' });
  if (resource === 'bytes' && result.digital.byteProduction > 0) entries.push({ id: 'digitalDownload', kind: 'income', name: 'dl.exe 下载', value: result.digital.byteProduction, note: '实际知识产出 × 分配比例 × 0.001 × 下载缓存器 × 神经网络 × 字节产量倍率' });
  if (resource === 'knowledge' && result.digital.divertedKnowledge > 0) entries.push({ id: 'digitalDownload', kind: 'expense', name: 'dl.exe 下载消耗', value: -result.digital.divertedKnowledge, note: '仅分配本次实际正向知识产出，不转换库存或负收入' });
  const synthesisRate = resource === 'knowledge' ? result.geneSynthesis?.knowledge || 0 : 0;
  if (synthesisRate > 0) entries.push({ id: 'geneSynthesis', kind: 'expense', name: '基因合成消耗', value: -synthesisRate, note: '按分配比例抽取本次实际正向知识产出；不使用库存' });
  const ejectedRate = result.ejected?.[resource] || 0;
  if (ejectedRate > 0) entries.push({ id: 'massEjection', kind: 'expense', name: '质量喷射消耗', value: -ejectedRate, note: '按喷射分配与可用库存实际喷入黑洞的数量' });
  if (resource === 'food') {
    const perCat = calculateFoodPerCat(state);
    entries.push({ id: 'population', kind: 'expense', name: '猫口口粮', value: -state.population * perCat, note: `${state.population} 只猫 × ${perCat}/s（包含工作猫与闲置猫）` });
    // The army eats too; without this row the tooltip would disagree with `rates.food`.
    const upkeep = soldierFoodUpkeep(state);
    if (upkeep > 0) entries.push({ id: 'soldierUpkeep', kind: 'expense', name: '军粮', value: -upkeep, note: `${state.soldiers} 名士兵 × ${SOLDIER_FOOD_UPKEEP}/s` });
  }

  const income = entries.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.value, 0);
  const expense = entries.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.value, 0);
  return { entries, income, expense, net: income + expense, communityCenter: (state.buildings.communityCenter || 0) > 0 };
  });
}

export interface FactorRow { name: string; value: string; child: boolean }
export interface FactorRows { rows: FactorRow[] }

/** Signed per-second rate text, matching the tooltip formatting exactly. */
export function signedRate(n: number): string {
  const text = formatRateNumber(Math.abs(n));
  return (n < 0 && text !== '0' ? '−' : '+') + text + '/s';
}

function percentText(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Multiplier and factor rows for a resource tooltip; children indent under their parent. */
export function calculateResourceFactorRows(
  resource: ResourceId,
  state: GameState,
  result: DeepReadonly<ProductionResult>,
): FactorRows {
  return withPoweredMetalRefining(state, result.inputUnits.metalRefinery || 0, state => {
  const rows: FactorRow[] = [];
  const add = (name: string, value: string, child = false) => rows.push({ name, value, child });
  const pct = (name: string, factor: number, child = false) => {
    if (Math.abs(factor - 1) > 1e-9) add(name, (factor < 1 ? '−' : '+') + percentText(Math.abs(factor - 1) * 100) + '%', child);
  };
  /**
   * 占领 / 世界统一 are global output factors folded into `calculateGlobalOutputMultiplier`,
   * so they must be listed wherever that factor is actually applied. 电力 is excluded on
   * purpose: it is a fixed supply budget, and the settlement never scales it.
   */
  const addGlobalOutputRows = () => {
    if (resource === 'energy') return;
    const occupied = state.neighbors ? activeOccupationCount(state) : 0;
    pct(`占领 ×${occupied}`, occupationOutputMultiplier(state as GameState));
    pct('世界统一', unificationOutputMultiplier(state));
  };
  if (resource === 'bytes') {
    if (result.digital.byteProduction > 0) add('dl.exe 下载', '+' + formatByteNumber(result.digital.divertedKnowledge * .001, true) + '/s');
    pct('精通', calculateMasteryMultiplier('bytes', state));
    pct('下载缓存器', 1 + .1 * result.digital.cacheUnits);
    pct('神经网络', result.digital.neuralMultiplier);
    if (result.digital.decoderProduction) add('CPU解码器', '+' + formatByteNumber(result.digital.decoderProduction, true) + '/s');
    pct('AGI核心组件', 1 + .5 * result.digital.agiComponentUnits);
    pct('粒子', calculateParticleMultiplier(resource, state));
    pct('粒子加速器', calculateChallengeAcceleratorMultiplier(resource, state));
    pct('幸福度', calculateHappinessMultiplier(result.morale.happiness));
    return { rows };
  }
  if (resource === 'encryptedData') {
    if (result.digital.decryptionUnits) add('数据解密模块', signedRate(result.digital.decryptionUnits * BUILDINGS.dataDecryptionModule.output!.encryptedData!));
    if (result.digital.aesUnits) add('AES算力模块', signedRate(result.digital.aesUnits * .005));
    pct('数据解密模块产量加成', 1 + .25 * result.digital.decryptionUnits);
    pct('粒子', calculateParticleMultiplier(resource, state));
    pct('粒子加速器', calculateChallengeAcceleratorMultiplier(resource, state));
    pct('幸福度', calculateHappinessMultiplier(result.morale.happiness));
    pct('精通', calculateMasteryMultiplier('encryptedData', state));
    return { rows };
  }
  const data = calculateResourceBreakdown(resource, state, result);
  const happiness = result.morale.happiness;

  for (const e of data.entries.filter(entry => entry.kind === 'income' && (entry.value !== 0 || entry.id === 'catTax'))) {
    if (e.id === 'catTax') {
      add(e.name, signedRate(calculateTaxBase(state)));
      // 占领 costs order: the collected rate is lowered per occupied city, so the tax
      // penalty belongs right beside the tax base, not only in the government panel.
      // Kept even when the penalty drives the collected rate to 0 — that is exactly the
      // case where the player needs to see why tax income vanished.
      const occupied = activeOccupationCount(state);
      if (occupied > 0) {
        const collected = occupationTaxRate(state as GameState);
        add(`占领 ×${occupied} 税收惩罚`, `−${percentText(state.taxRate - collected)}%`, true);
        add('实际税率', `${percentText(collected)}%`, true);
      }
      pct('银行家', calculateBankerMultiplier(state), true);
      pct('寡头', calculateGovernmentMultiplier('cash', state), true);
      continue;
    }
    if (e.id === 'soldierFur') {
      // Base row is per-soldier fur at the *current* 战斗力; the 战斗力 factor is shown
      // as its own percentage row so the square root is visible in the tooltip.
      add(e.name, signedRate(state.soldiers * SOLDIER_FUR_BASE));
      pct('单兵战斗力', soldierFurPerSoldier(state) / SOLDIER_FUR_BASE, true);
      continue;
    }
    if (e.id === 'titaniumByproduct') {
      add(e.name, signedRate(e.value / (calculateProductionMultiplier('titanium', happiness, state) * calculateGlobalOutputMultiplier(resource, state))));
      continue;
    }
    if (e.id.startsWith('craft:')) {
      const craftId = e.id.slice(6) as keyof typeof CRAFT_RECIPES;
      // 工匠大师 doubles the artisan throughput, so it is already inside the base amount.
      const baseAmount = result.inputUnits[e.id] || 0;
      add(e.name, signedRate(baseAmount));
      const expected = (state.craftWorkers[craftId] || 0) * artisanCraftRate(CRAFT_RECIPES[craftId].rate, state);
      if (expected && baseAmount < expected - 1e-9) pct('原料供应', baseAmount / expected, true);
      // 技工 is an independent crafted-output bonus, so it gets its own row.
      if (state.crispr.includes('technician')) pct('技工', 2, true);
      pct('超频锻造（工匠）', 1 + geneExtraBonus(state, 'overclockForging'), true);
      continue;
    }
    const opt = FACTORY_OPTIONS.find(option => option.id === e.id);
    if (opt) {
      const units = state.lines[opt.id] || 0, ran = result.inputUnits[opt.id] || 0;
      const recipe = calculateFactoryRecipe(opt.id, state);
      // 完美主义 is already folded into the recipe's base output; no separate row.
      add(opt.name, signedRate((recipe.output?.[resource] || 0) * ran));
      if (units && ran < units - 1e-9) pct('供电与原料供应', ran / units, true);
      if (state.government === 'industrialism') pct('工业至上', 1.25, true);
      pct('量子制造', calculateQuantumManufacturingMultiplier(state, resource, result.quantum.level), true);
      if (resource === 'polymer' && state.tech.includes('titaniumAlloyReactor')) pct('钛合金反应器', 1.5, true);
      continue;
    }
    const id = e.id as BuildingId;
    const b = BUILDINGS[id];
    if (!b) continue;
    // 冶炼厂 rows count steel-assigned 冶炼厂工位 rather than buildings.
    const n = id === 'smelter' ? calculateSmelterSlotCapacity(state) : state.buildings[id], workers = state.workers[id];
    const running = id === 'smelter' ? calculateRunningSmelterSlots(state) : Math.max(0, n - (state.stoppedBuildings?.[id] || 0));
    if (isPowerProducer(id)) {
      add(calculateBuildingName(id, state), signedRate(e.value));
      // Same running count as settlePowerPlants: segmented plants (空间撕裂者) count complete units, not segments.
      const plants = countRunningBuildings(id, state);
      if (plants && (result.inputUnits[id] || 0) < plants - 1e-9) pct('原料供应', (result.inputUnits[id] || 0) / plants, true);
      continue;
    }
    const globalFactor = (resource === 'energy' ? 1 : calculateProductionMultiplier(resource, happiness, state))
      * (resource === 'knowledge' ? calculateKnowledgeMultiplier(state, result.inputUnits.observatory || 0, result.digital) : 1)
      * calculateGlobalOutputMultiplier(resource, state);
    const sourceValue = (globalFactor > 0 ? e.value / globalFactor : e.value)
      / (id === 'cementWorkshop' ? 1 + (result.inputUnits.cementMixer || 0) * .05 : 1)
      / (id === 'lumber' || id === 'quarry' ? 1 + (result.inputUnits[id === 'lumber' ? 'automatedLumber' : 'automatedQuarry'] || 0) * .05 : 1)
      / (id === 'lab' ? 1 + RESEARCH_SATELLITE_LAB_OUTPUT * (state.buildings.researchSatellite || 0) : 1)
      / (id === 'catCafe' ? chipFactoryOutputMultiplier(state) : 1)
      / (id === 'iridiumMine' && resource === 'iridium' ? 1 + .05 * (result.inputUnits.geothermalPlant || 0) : 1)
      / (id === 'talosMoonMiningStation' && resource === 'neutron' ? 1 + .05 * (state.buildings.miningDrone || 0) : 1)
      / calculateSpaceMultiplier(id, state, result.asriel)
      / calculateHyperspaceLocalMultiplier(id, state, result.inputUnits.adamantiteProcessor || 0);
    add(id === 'smelter' ? '钢冶炼工位' : id === 'catCafe' && resource === 'cash' ? calculateBuildingName(id, state) : b.workerName || calculateBuildingName(id, state), signedRate(sourceValue));

    // 基因修饰 bonuses are already part of the base value (calculateBuildingOutput); no separate row.
    let local = 1;
    if (id === 'adamantiteMiningShip') {
      const factor = calculateHyperspaceLocalMultiplier(id, state, result.inputUnits.adamantiteProcessor || 0);
      pct(calculateBuildingName('adamantiteProcessor', state), factor, true); local *= factor;
    }
    if (id === 'iridiumMine' && resource === 'iridium') {
      const factor = 1 + .05 * (result.inputUnits.geothermalPlant || 0);
      pct('地热发电站', factor, true);
      local *= factor;
    }
    if (id === 'talosMoonMiningStation' && resource === 'neutron') {
      const factor = 1 + .05 * (state.buildings.miningDrone || 0);
      pct('采矿无人机', factor, true);
      local *= factor;
    }
    if (isSpaceResourceSource(id)) {
      const factor = calculateSpaceMultiplier(id, state, result.asriel);
      pct('星环空间站', factor, true);
      local *= factor;
    }
    if (id === 'grapheneFactory') {
      const f = calculateAiGrapheneMultiplier(state, result.quantum.level);
      pct('高级石墨烯加工', f, true); local *= f;
    }

    // 芯片工厂的两个科技直接抬高基础产量（见 simulation/chip-factory.ts），因此不在明细里
    // 单列成加成行；但 `local` 仍要乘上它们，否则第 395 行的 `expected` 会与真实产出分叉。
    if (id === 'catCafe') local *= chipFactoryOutputMultiplier(state);
    if (id === 'lab') { const f = 1 + RESEARCH_SATELLITE_LAB_OUTPUT * (state.buildings.researchSatellite || 0); pct('科研卫星', f, true); local *= f; }
    if (id === 'cementWorkshop') { const f = 1 + (result.inputUnits.cementMixer || 0) * .05; pct('供能水泥工匠', f, true); local *= f; }
    if (id === 'cementWorkshop') { const f = calculateAiCementMultiplier(state, result.quantum.level); pct('AI水泥工坊', f, true); local *= f; }
    if (b.workerOutput) {
      if (b.boostResource) { const f = 1 + n * ((id === 'lumber' || id === 'quarry') ? .02 : .05); pct(calculateBuildingName(id, state), f, true); local *= f; }
      if (b.minerBoost) { const f = 1 + (result.inputUnits[id === 'coalMine' ? 'automatedCoalMining' : 'automatedMining'] || 0) * .05; pct(id === 'coalMine' ? '供能煤矿' : '供能矿底', f, true); local *= f; }
      if (id === 'lumber' || id === 'quarry') { const f = 1 + (result.inputUnits[id === 'lumber' ? 'automatedLumber' : 'automatedQuarry'] || 0) * .05; pct(id === 'lumber' ? '供能伐木场' : '供能采石场', f, true); local *= f; }
    } else if (workers && n) {
      const f = 1 + workers * CONFIG.workerBonus / n; pct(`工作猫 ${workers} 只`, f, true); local *= f;
    }
    if (id === 'forage' && state.tech.includes('agriculture')) { pct('农业', 1.5, true); local *= 1.5; }
    if (calculateBuildingOutput(id, state).knowledge) local *= calculateKnowledgeMultiplier(state, result.inputUnits.observatory || 0, result.digital);
    if (id === 'observatory') local *= 1.1;

    const base = b.workerOutput
      ? Math.min(workers || 0, (b.unlimited ? Infinity : ((id === 'cementWorkshop' || id === 'mine' || id === 'coalMine') ? n : running)) * (b.slots ?? b.artistSlots ?? CONFIG.workersPerBuilding) + calculateGrantedJobSlots(id, state))
      : n;
    const unitOutput = calculateBuildingOutput(id, state, result.inputUnits)[resource] || 0;
    const multiplierValue = calculateProductionMultiplier(resource, happiness, state);
    const expected = unitOutput * base * multiplierValue * local * (b.workerOutput ? calculateToolMultiplier(id, state) : 1);
    if (b.input && expected > 0) {
      const units = b.workerOutput ? base : running;
      const ratio = units > 0 ? Math.min(1, (result.inputUnits[id] || 0) / units) : 1;
      if (ratio < 1 - 1e-9) pct('原料供应', ratio, true);
    }
  }

  // Independent multipliers do not depend on a production source existing today.
  if (resource === 'knowledge') pct('科技至上', calculateGovernmentMultiplier(resource, state));
  pct('粒子', calculateParticleMultiplier(resource, state));
  pct('精通', calculateMasteryMultiplier(resource, state));
  pct('粒子加速器', calculateChallengeAcceleratorMultiplier(resource, state));
  if (RESOURCES[resource].crafted) {
    // 锻造工具加成 is one additive pool: the total is a single independent factor,
    // and every contributing source is listed beneath it as a child row.
    const planetaryResidents = state.buildings.planetaryFoundry
      ? Math.min(state.population, state.workers.asrielResidence || 0, result.asriel.allocations.asrielResidence * 2) : 0;
    const planetaryAllocated = state.buildings.planetaryFoundry ? result.asriel.allocations.planetaryFoundry || 0 : 0;
    // Left column: the pooled total only. Per-source detail lives in the right
    // column's 锻造工具加成 section, so the two never show the same rows twice.
    const tool = calculateForgingToolBonus(state, planetaryResidents, planetaryAllocated);
    if (tool.total > 0) pct('锻造工具加成', 1 + tool.total);
    pct('超频锻造', calculateOverclockCraftMultiplier(state));
  }
  if (['aluminum', 'metal', 'iridium'].includes(resource)) pct('金属精炼厂', calculateRefiningMultiplier(resource, state));
  if (resource === 'knowledge') {
    pct('图书馆', 1 + state.buildings.library * (BUILDINGS.library.knowledgeBoost || 0));
    pct('数据中心', 1 + (result.inputUnits.observatory || 0) * (BUILDINGS.observatory.knowledgeBoost || .1));
    pct('AES计算模块', 1 + result.digital.aesUnits * (BUILDINGS.aesComputeModule.knowledgeBoost || 0));
  }
  if (resource !== 'energy' && !RESOURCES[resource].crafted) pct('幸福度', calculateHappinessMultiplier(happiness));
  // 占领 / 世界统一: listed last because they scale the whole resource, exactly like 幸福度.
  addGlobalOutputRows();
  return { rows };
  });
}

/** Expense-only rows, keeping the `child` flag the tooltips rely on. */
export function calculateResourceExpenseRows(data: ResourceBreakdown): FactorRow[] {
  const rows: FactorRow[] = [];
  for (const e of data.entries.filter(entry => entry.kind === 'expense' && entry.value !== 0)) {
    rows.push({ name: e.name.replace(/消耗$/, ''), value: signedRate(e.value), child: false });
    if (e.id === 'population' && data.communityCenter) rows.push({ name: '猫猫社区', value: '−20%', child: true });
  }
  return rows;
}
