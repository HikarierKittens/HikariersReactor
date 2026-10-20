/**
 * Supported schema31 upgrades, not a migration of retired schemas.
 * Only absent entries introduced by supported releases are eligible.
 * Keep malformed records and explicitly supplied values for strict validation.
 * In particular, earned technology never backfills the one-time research reward.
 */
/**
 * Buildings added after the first schema31 saves. Each is backfilled only when
 * the field itself is absent, and only for the three count records, so an
 * explicitly malformed value still reaches strict validation untouched.
 */
import { createNeighborsState } from '../simulation/neighbors';

const ADDITIVE_BUILDING_IDS = [
  'dysonSphere', 'hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage',
  'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder',
  'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule', 'softRouterNode', 'aesComputeModule',
  'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore', 'solarFarm', 'hospital',
] as const;

/** Small deterministic PRNG (mulberry32) seeded from the save's own stable fields. */
function seededFromSave(raw: Record<string, unknown>): () => number {
  const source = `${String(raw.eventIn)}|${String(raw.lastSaved)}|${String(raw.time)}|${String(raw.clicks)}|${String(raw.soldiers)}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let seed = hash >>> 0;
  return () => {
    seed = (seed + 1831565813) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSchema31Save(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 31) return raw;
  const normalized = { ...raw };
  const defaults: Record<string, readonly string[]> = {
    buildings: ADDITIVE_BUILDING_IDS,
    workers: ADDITIVE_BUILDING_IDS,
    stoppedBuildings: ADDITIVE_BUILDING_IDS,
    prestige: ['harmonyCrystals', 'ascensionResets'],
    resources: ['bytes', 'encryptedData'], containerAssignments: ['bytes', 'encryptedData'], alloyContainerAssignments: ['bytes', 'encryptedData'],
  };
  for (const [field, keys] of Object.entries(defaults)) {
    const record = raw[field];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const missing = keys.filter(key => !Object.hasOwn(record, key));
    if (missing.length) normalized[field] = { ...record, ...Object.fromEntries(missing.map(key => [key, 0])) };
  }
  const statistics = raw.statistics;
  if (statistics && typeof statistics === 'object' && !Array.isArray(statistics)) {
    const lifetime = (statistics as Record<string, unknown>).lifetime;
    if (lifetime && typeof lifetime === 'object' && !Array.isArray(lifetime) && !Object.hasOwn(lifetime, 'harmonyCrystalsEarned')) {
      normalized.statistics = { ...statistics, lifetime: { ...lifetime, harmonyCrystalsEarned: 0 } };
    }
  }
  if (!Object.hasOwn(raw, 'downloadAllocation')) normalized.downloadAllocation = 0;
  // 临近势力 arrived after the first schema31 saves; only absent fields get defaults so an
  // explicitly malformed record still fails strict validation instead of being repaired.
  if (!Object.hasOwn(raw, 'wounded')) normalized.wounded = 0;
  // 医院 arrived later; its carry-over progress is meaningless without the building.
  if (!Object.hasOwn(raw, 'hospitalProgress')) normalized.hospitalProgress = 0;
  // Upgrading an old save must be deterministic: validating the same raw record twice has
  // to produce the same neighbours, or the first load would differ from every re-load.
  // Seed from fields the save already owns; a brand-new game still rolls with Math.random.
  if (!Object.hasOwn(raw, 'neighbors')) normalized.neighbors = createNeighborsState(seededFromSave(raw));
  if (!Object.hasOwn(raw, 'powerActivationOrder')) normalized.powerActivationOrder = [];
  removeRetiredPowerContent(normalized);
  return normalized;
}

/** Remove only known retired content, without loosening validation of other IDs.
 * Copy each touched record/array: callers may supply frozen historical JSON.
 */
function removeRetiredPowerContent(raw: Record<string, unknown>): void {
  const recordOf = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const owned = recordOf(raw.buildings)?.batteryStation;
  for (const field of ['buildings', 'workers', 'stoppedBuildings'] as const) {
    const record = recordOf(raw[field]);
    if (!record || !Object.hasOwn(record, 'batteryStation')) continue;
    const count = record.batteryStation;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0
      || (field === 'workers' && count !== 0)
      || (field === 'stoppedBuildings' && count > (typeof owned === 'number' ? owned : 0))) throw Error('退役储能站数据无效。');
    const copy = { ...record };
    delete copy.batteryStation;
    raw[field] = copy;
  }
  if (!Array.isArray(raw.queue)) return; // The ordinary validator reports malformed records.
  if (raw.queue.length > 10000) throw Error('待购队列无效。');
  const seenUID = new Set<number>();
  raw.queue = raw.queue.filter((entry: unknown) => {
    const q = recordOf(entry);
    if (!q) return true;
    // Validate UID uniqueness before filtering so retirement cannot conceal a
    // malformed queue or make a retained entry reuse a removed entry's identity.
    if (typeof q.uid !== 'number' || !Number.isSafeInteger(q.uid) || q.uid < 1 || seenUID.has(q.uid)) throw Error('队列项目无效。');
    seenUID.add(q.uid);
    const retiredBuilding = q.kind === 'build' && q.id === 'batteryStation';
    const retiredResearch = q.kind === 'tech' && (q.id === 'energyStorage' || q.id === 'batteryConcentrationRing');
    if ((retiredBuilding || retiredResearch) && Object.hasOwn(q, 'segments')) throw Error('分段队列数量无效。');
    return !retiredBuilding && !retiredResearch;
  });
}
