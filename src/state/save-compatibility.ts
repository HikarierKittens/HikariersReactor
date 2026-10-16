/**
 * Additive defaults within schema31, not a migration of retired schemas.
 * Only absent entries introduced by supported releases are eligible.
 * Keep malformed records and explicitly supplied values for strict validation.
 * In particular, earned technology never backfills the one-time research reward.
 */
export function normalizeSchema31Save(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 31) return raw;
  const normalized = { ...raw };
  const defaults: Record<string, readonly string[]> = {
    buildings: ['hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder'],
    workers: ['hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder'],
    stoppedBuildings: ['hazardousMaterialStorage', 'gatewayRouter', 'downloadExecutable', 'quantumStorage', 'downloadCache', 'subcomputeNode', 'quantizedCompressionModule', 'dataCompression', 'cpuDecoder'],
    resources: ['bytes'], containerAssignments: ['bytes'], alloyContainerAssignments: ['bytes'],
  };
  for (const [field, keys] of Object.entries(defaults)) {
    const record = raw[field];
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const missing = keys.filter(key => !Object.hasOwn(record, key));
    if (missing.length) normalized[field] = { ...record, ...Object.fromEntries(missing.map(key => [key, 0])) };
  }
  if (!Object.hasOwn(raw, 'downloadAllocation')) normalized.downloadAllocation = 0;
  return normalized;
}
