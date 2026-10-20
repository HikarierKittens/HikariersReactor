import { fmt } from '../format';

type MeterSource = { used: number; capacity: number };

/** Common aria/title bindings for a "当前已用 / 总量" region meter. */
export function regionBalanceBind(source: MeterSource, label: string) {
  return {
    'aria-label': `${label}：已用/总量`,
    title: `${label}：当前已用 / 总量`,
  };
}

/** Render the numeric part with the same shared formatter. */
export function regionBalanceText(source: MeterSource): string {
  return `${fmt(source.used)}/${fmt(source.capacity)}`;
}
