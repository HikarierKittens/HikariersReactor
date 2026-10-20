export const CONFIG = {
  secondsPerDay: 5, daysPerYear: 400,
  particleProductionSoftCap: 400, particleProductionDecayStrength: .2,
  version: 31, saveKey: 'meow-civilization-v12',
  foodPerCat: 1, populationGrowthRate: 1.5, growthFastMin: 5, growthFastMax: 10, growthMin: 10, growthMax: 20,
  simulateLimit: 28800, eventMin: 60, eventMax: 600, workerBonus: .3, workersPerBuilding: 5,
  /** Live settlement horizon; previews that must match the next tick use this step. */
  uiStepSeconds: .2,
};

/**
 * Exported-save encryption keys, one 64-hex-character (32-byte) AES-256 key per
 * version. Bump the version to rotate: never edit or delete an existing entry, or
 * every backup a player already holds becomes unreadable.
 *
 * This key ships in the client bundle, so it prevents hand-edited saves from loading;
 * it is not a secret and not anti-cheat.
 */
export const SAVE_EXPORT_KEYS: Readonly<Record<number, string>> = {
  1: 'e97db546d5e9e5ab7964eda94ad5983079a34654a798c30e59ef76e0753ecdb7',
};
