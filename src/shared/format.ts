/** Snap only machine-roundoff near integer boundaries; genuine fractions stay truncated. */
export function floorWithPrecision(value: number): number {
  const nearest = Math.round(value);
  const tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(value)) * 32);
  return Math.floor(Math.abs(value - nearest) <= tolerance ? nearest : value);
}

const METRIC_UNITS = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'] as const;
/** Promote only above 10000 of the current unit, as requested by the resource UI. */
function metricUnit(magnitude: number): readonly [number, string] {
  let scale = 1, index = 0;
  while (index < METRIC_UNITS.length - 1 && magnitude / scale > 10000) { scale *= 1000; index++; }
  return [scale, METRIC_UNITS[index]!];
}

/** Effect values are not spendable stock: display up to four decimals without padding. */
export function formatEffectNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const [scale, suffix] = metricUnit(Math.abs(value));
  const text = (value / scale).toFixed(4).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return text === '-0' ? '0' : text.replace(/^-/, '−') + suffix;
}

/** Rates are measurements, not spendable balances: round independently of inventory. */
export function formatRateNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const magnitude = Math.abs(value);
  const [scale, suffix] = metricUnit(magnitude);
  const text = (magnitude / scale).toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return (value < 0 && text !== '0' ? '−' : '') + text + suffix;
}

/** Resource amounts retain two fractional digits, including compact units.
 * Display truncates spendable stock rather than claiming a rounded-up balance.
 * Only machine representation noise at a decimal boundary is snapped. */
export function formatResourceNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const magnitude = Math.abs(value);
  const [scale, suffix] = metricUnit(magnitude);
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
  const [scale, suffix] = metricUnit(magnitude);
  return sign + stripZeros((floorWithPrecision(magnitude / scale * 100) / 100).toFixed(2)) + suffix;
}
