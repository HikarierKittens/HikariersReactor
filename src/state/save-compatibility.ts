/**
 * Additive beta0.6.5 defaults within schema31, not a migration of retired schemas.
 * Only absent entries in the three complete building registries are eligible.
 * Keep malformed records and explicitly supplied values for strict validation.
 */
export function normalizeSchema31Save(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version !== 31) return raw;
  const normalized = { ...raw };
  for (const field of ['buildings', 'workers', 'stoppedBuildings'] as const) {
    const record = raw[field];
    if (record && typeof record === 'object' && !Array.isArray(record)
      && !Object.hasOwn(record, 'hazardousMaterialStorage')) {
      normalized[field] = { ...record, hazardousMaterialStorage: 0 };
    }
  }
  return normalized;
}
