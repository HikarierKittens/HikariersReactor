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

/** Resource amounts and rates retain two fractional digits, including compact units.
 * Display truncates spendable stock rather than claiming a rounded-up balance.
 * Only machine representation noise at a decimal boundary is snapped. */
export function formatResourceNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const magnitude = Math.abs(value);
  const units: readonly (readonly [number, string])[] = [[1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'K']];
  const [scale, suffix] = magnitude >= 10000 ? units.find(([scale]) => magnitude >= scale)! : [1, ''];
  const scaled = magnitude / scale * 100;
  // Scaling enormous values must not overflow or introduce an unsafe integer conversion.
  const displayed = Number.isSafeInteger(Math.floor(scaled)) ? floorWithPrecision(scaled) / 100 : magnitude / scale;
  const text = displayed.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return (value < 0 && displayed !== 0 ? '−' : '') + text + suffix;
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
