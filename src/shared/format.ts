/** Snap only machine-roundoff near integer boundaries; genuine fractions stay truncated. */
export function floorWithPrecision(value: number): number {
  const nearest = Math.round(value);
  const tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(value)) * 32);
  return Math.floor(Math.abs(value - nearest) <= tolerance ? nearest : value);
}

/** Effect values are not spendable stock: display up to four decimals without padding. */
export function formatEffectNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const text = value.toFixed(4).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return text === '-0' ? '0' : text.replace(/^-/, '−');
}

/** Truncate rather than round, compensating only for floating-point representation noise. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const magnitude = Math.abs(value), sign = value < 0 ? '−' : '';
  const stripZeros = (text: string): string => text.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  if (magnitude < 10000) {
    const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
    return sign + stripZeros((floorWithPrecision(magnitude * 10 ** digits) / 10 ** digits).toFixed(digits));
  }
  const units: readonly (readonly [number, string])[] = [[1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'K']];
  const [scale, suffix] = units.find(([scale]) => magnitude >= scale)!;
  return sign + stripZeros((floorWithPrecision(magnitude / scale * 100) / 100).toFixed(2)) + suffix;
}
