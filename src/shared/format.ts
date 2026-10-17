/** Snap only machine-roundoff near integer boundaries; genuine fractions stay truncated. */
export function floorWithPrecision(value: number): number {
  const nearest = Math.round(value);
  const tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(value)) * 32);
  return Math.floor(Math.abs(value - nearest) <= tolerance ? nearest : value);
}

const METRIC_UNITS = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'] as const;
/** Context controls the first suffix; all subsequent SI units advance every thousand. */
function metricUnit(magnitude: number, threshold = 10000): readonly [number, string] {
  let scale = 1, index = 0;
  if (magnitude >= threshold) {
    do { scale *= 1000; index++; }
    while (index < METRIC_UNITS.length - 1 && magnitude / scale >= 1000);
  }
  return [scale, METRIC_UNITS[index]!];
}

/** Purchase quotes begin SI notation at ten thousand and truncate spendable amounts. */
export function formatCostNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const [scale, suffix] = metricUnit(Math.abs(value));
  const amount = floorWithPrecision(Math.abs(value) / scale * 100) / 100;
  const text = amount.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return (value < 0 && amount !== 0 ? '−' : '') + text + suffix;
}

/** Decimal bytes keep their own symbols; stock starts at 1000, rates/costs/effects at 10000.
 * Unscaled rates retain rounding; compact values and balances truncate to two decimals. */
export function formatByteNumber(value: number, rate = false, threshold = rate ? 10000 : 1000): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞B' : '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'RB', 'QB'];
  const [scale, suffix] = metricUnit(Math.abs(value), threshold);
  const index = METRIC_UNITS.indexOf(suffix as typeof METRIC_UNITS[number]);
  const magnitude = Math.abs(value) / scale;
  const amount = rate && scale === 1 ? Number(magnitude.toFixed(2)) : floorWithPrecision(magnitude * 100) / 100;
  return (value < 0 && amount !== 0 ? '−' : '') + amount.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') + units[index];
}

/** Unscaled effects retain four decimals; compact effects truncate to two without padding. */
export function formatEffectNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const [scale, suffix] = metricUnit(Math.abs(value));
  const amount = scale === 1 ? value : Math.sign(value) * floorWithPrecision(Math.abs(value) / scale * 100) / 100;
  const text = amount.toFixed(scale === 1 ? 4 : 2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return text === '-0' ? '0' : text.replace(/^-/, '−') + suffix;
}

/** Rates are measurements, not spendable balances: round independently of inventory. */
export function formatRateNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const magnitude = Math.abs(value);
  const [scale, suffix] = metricUnit(magnitude);
  const amount = scale === 1 ? magnitude : floorWithPrecision(magnitude / scale * 100) / 100;
  const text = amount.toFixed(2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return (value < 0 && text !== '0' ? '−' : '') + text + suffix;
}

/** Resource amounts retain two fractional digits, including compact units.
 * Display truncates spendable stock rather than claiming a rounded-up balance.
 * Only machine representation noise at a decimal boundary is snapped. */
export function formatResourceNumber(value: number): string {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : '0';
  const magnitude = Math.abs(value);
  const [scale, suffix] = metricUnit(magnitude, 1000);
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
