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
  'dysonSphere', 'hazardousMaterialStorage', 'aiDataCenter', 'gatewayRouter', 'downloadExecutable', 'quantumStorage',
  'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder',
  'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule', 'softRouterNode', 'aesComputeModule',
  'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore', 'solarFarm', 'hospital',
  // Schema 32 split every segmented project into a construction phase and a completed building.
  'agiCoreComponentSegments', 'agiAscensionCoreSegments', 'spaceRipperSegments', 'dysonSphereSegments',
  'penroseSphereSegments', 'aiSupercoreSegments', 'dysonSphereL2', 'dysonSphereL2Segments',
] as const;

/**
 * Schema 31 stored segmented projects as one counter: `buildings.dysonSphere = 17` meant
 * "17 of 100 segments built". Schema 32 treats the construction phase and the finished building
 * as different buildings, so the stored number changes meaning and must be transformed:
 * complete units move to the same ID (now the completed building), the remainder stays on the
 * new `*Segments` ID so partially built projects keep their progress (and their partial effect).
 */
const SEGMENT_SPLITS: { id: string; segments: string; required: number }[] = [
  { id: 'agiCoreComponent', segments: 'agiCoreComponentSegments', required: 100 },
  { id: 'agiAscensionCore', segments: 'agiAscensionCoreSegments', required: 100 },
  { id: 'spaceRipper', segments: 'spaceRipperSegments', required: 100 },
  { id: 'dysonSphere', segments: 'dysonSphereSegments', required: 100 },
  { id: 'penroseSphere', segments: 'penroseSphereSegments', required: 100 },
  { id: 'aiSupercore', segments: 'aiSupercoreSegments', required: 100 },
];
function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Tier-two sphere: introduced with schema 32, so it has no schema-31 counter to split. */
const TIER_TWO_SPLIT = { id: 'dysonSphereL2', segments: 'dysonSphereL2Segments', required: 100 } as const;

/**
 * Schema 32 kept construction counters alive after a project finished, so a save could own both
 * the completed building and a fresh partial project (`spaceRipper: 1` + `spaceRipperSegments: 3`).
 * Schema 33 makes every segmented project one-off: once the completed form exists the construction
 * row is gone and its counter is dropped, together with any queue entry that was buying into it.
 * Progress is only discarded for a project that already delivered its completed building; a save
 * that never finished keeps every segment it had.
 */
function dropFinishedConstruction(raw: Record<string, unknown>): Record<string, unknown> {
  const counts = recordOf(raw.buildings);
  // Malformed records are left for strict validation; the upgrade never guesses a shape.
  if (!counts) return { ...raw, version: 33 };
  const upgraded: Record<string, unknown> = { ...raw, version: 33, buildings: { ...counts } };
  const stopped = recordOf(raw.stoppedBuildings);
  if (stopped) upgraded.stoppedBuildings = { ...stopped };
  const workers = recordOf(raw.workers);
  if (workers) upgraded.workers = { ...workers };
  const buildings = upgraded.buildings as Record<string, unknown>;
  const stoppedCounts = upgraded.stoppedBuildings as Record<string, unknown> | undefined;
  const finished = new Set<string>();
  for (const split of [...SEGMENT_SPLITS, TIER_TWO_SPLIT]) {
    const owned = buildings[split.id];
    if (typeof owned !== 'number' || !Number.isSafeInteger(owned) || owned < 1) continue;
    finished.add(split.segments);
    // One-off projects keep exactly one completed unit. Older saves could stack several
    // (`spaceRipper: 250`); the extra copies cannot be represented any more, so the count is
    // clamped instead of being rejected, and the earned first unit is preserved.
    buildings[split.id] = 1;
    buildings[split.segments] = 0;
    if (stoppedCounts) {
      const stoppedUnits = stoppedCounts[split.id];
      stoppedCounts[split.id] = typeof stoppedUnits === 'number' && Number.isSafeInteger(stoppedUnits)
        ? Math.min(Math.max(0, stoppedUnits), 1) : stoppedUnits;
      stoppedCounts[split.segments] = 0;
    }
    if (upgraded.workers) (upgraded.workers as Record<string, unknown>)[split.segments] = 0;
  }
  if (!finished.size) return upgraded;
  // Construction that can never continue must not stay queued: settlement would buy segments for a
  // finished project and silently discard them.
  if (Array.isArray(raw.queue)) {
    upgraded.queue = (raw.queue as unknown[]).filter(entry => {
      const item = recordOf(entry);
      return !(item && item.kind === 'build' && typeof item.id === 'string' && finished.has(item.id));
    });
  }
  // Activation order is bounded by the running count, so a clamped project cannot keep two entries.
  const order = raw.powerActivationOrder;
  if (Array.isArray(order)) {
    upgraded.powerActivationOrder = order.filter(entry => {
      const item = recordOf(entry);
      if (!item || typeof item.id !== 'string') return true;
      const clamped = [...SEGMENT_SPLITS, TIER_TWO_SPLIT].some(split => split.id === item.id);
      return !clamped || (typeof item.count === 'number' && item.count <= 1);
    });
  }
  return upgraded;
}

/** Copies every touched record: callers may pass frozen historical JSON. */
function upgradeSchema31To32(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 31) return raw;
  const upgraded: Record<string, unknown> = { ...raw, version: 32 };
  const counts = recordOf(raw.buildings);
  if (counts) upgraded.buildings = { ...counts };
  const stopped = recordOf(raw.stoppedBuildings);
  if (stopped) upgraded.stoppedBuildings = { ...stopped };
  const workers = recordOf(raw.workers);
  if (workers) upgraded.workers = { ...workers };
  for (const split of SEGMENT_SPLITS) {
    const owned = counts ? counts[split.id] : undefined;
    // Malformed counts stay untouched: strict validation must reject them, not "repair" them.
    if (typeof owned !== 'number' || !Number.isSafeInteger(owned) || owned < 0) continue;
    const complete = Math.floor(owned / split.required);
    const remainder = owned % split.required;
    (upgraded.buildings as Record<string, unknown>)[split.id] = complete;
    (upgraded.buildings as Record<string, unknown>)[split.segments] = remainder;
    if (stopped) {
      const stoppedCount = stopped[split.id];
      // Stopped units were complete units only; segments have no switch of their own.
      (upgraded.stoppedBuildings as Record<string, unknown>)[split.id] = typeof stoppedCount === 'number' && Number.isSafeInteger(stoppedCount) && stoppedCount >= 0
        ? Math.min(stoppedCount, complete) : stoppedCount;
      (upgraded.stoppedBuildings as Record<string, unknown>)[split.segments] = 0;
    }
  }
  // Queue entries keep buying segments; only the target ID changes to the construction phase.
  if (Array.isArray(raw.queue)) {
    const byId = new Map(SEGMENT_SPLITS.map(split => [split.id, split.segments]));
    upgraded.queue = (raw.queue as unknown[]).map(entry => {
      const item = recordOf(entry);
      if (!item || item.kind !== 'build' || typeof item.id !== 'string') return entry;
      const segments = byId.get(item.id);
      return segments ? { ...item, id: segments } : entry;
    });
  }
  // Activation counts were in completed units, which is exactly the new completed count.
  const order = raw.powerActivationOrder;
  if (Array.isArray(order)) {
    const limits = new Map<string, number>();
    for (const split of SEGMENT_SPLITS) {
      const value = (upgraded.buildings as Record<string, unknown>)[split.id];
      limits.set(split.id, typeof value === 'number' ? value : 0);
    }
    upgraded.powerActivationOrder = order
      .map(entry => {
        const item = recordOf(entry);
        if (!item || typeof item.id !== 'string' || typeof item.count !== 'number') return entry;
        const limit = limits.get(item.id);
        if (limit === undefined) return entry;
        return { ...item, count: Math.min(item.count, limit) };
      })
      // Drop only the split entries this upgrade emptied. Explicit malformed entries for every
      // other building must reach the ordinary validator so it can reject them instead of having
      // the upgrade silently repair the data.
      .filter(entry => {
        const item = recordOf(entry);
        if (!item || typeof item.id !== 'string') return true;
        return limits.get(item.id) === undefined || typeof item.count !== 'number' || item.count > 0;
      });
  }
  return upgraded;
}

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

/** Current-schema normalization: 31→32 splits counters, 32→33 retires finished construction
 *  phases, then absent additive records are backfilled. Every step copies what it edits. */
export function normalizeSchemaSave(raw: Record<string, unknown>): Record<string, unknown> {
  return normalizeAdditiveDefaults(upgradeSchema32To33(upgradeSchema31To32(raw)));
}

/** Kept for callers that still speak the old name; identical behaviour. */
export const normalizeSchema31Save = normalizeSchemaSave;

/** Schema 33: a finished segmented project no longer keeps a construction phase.
 *  Only genuine schema-32 records are upgraded; a current save with a malformed stopped count
 *  must reach strict validation instead of being clamped by this step. */
export function upgradeSchema32To33(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 32) return raw;
  return dropFinishedConstruction(raw);
}

/** Backfill records that supported releases added after the first saves of their schema. */
export function normalizeAdditiveDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 32 && raw.version !== 33) return raw;
  const normalized: Record<string, unknown> = { ...raw };
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
