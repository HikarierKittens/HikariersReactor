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
const ADDITIVE_BUILDING_IDS = [
  'dysonSphere', 'hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage',
  'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder',
  'cellCore', 'memoryCore', 'ethMiner', 'dataDecryptionModule', 'softRouterNode', 'aesComputeModule',
  'worldSimulator', 'agiCoreComponent', 'coreCooler', 'agiAscensionCore', 'solarFarm',
] as const;

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
