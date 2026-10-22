import { fmt } from '../format';

type MeterSource = { used: number; capacity: number };

/** Common aria/title bindings for a "当前已用 / 总量" region meter.
 *  The numbers themselves go through regionBalanceText; these labels never read them. */
export function regionBalanceBind(label: string) {
  return {
    'aria-label': `${label}：已用/总量`,
    title: `${label}：当前已用 / 总量`,
  };
}

/** Render the numeric part with the same shared formatter. */
export function regionBalanceText(source: MeterSource): string {
  return `${fmt(source.used)}/${fmt(source.capacity)}`;
}
