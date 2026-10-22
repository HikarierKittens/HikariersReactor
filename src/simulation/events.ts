import { CONFIG } from '../data/config';
import { EVENTS } from '../data/progression';
import type { GameState } from '../types/state';

export function sampleEventInterval(random: () => number): number {
  return CONFIG.eventMin + random() * (CONFIG.eventMax - CONFIG.eventMin);
}
/** Returns the notification text; storage capacity and randomness are explicit inputs.
 *  `_metalCapacity` is kept so callers stay uniform with the shared event signature. */
export function applyRandomEvent(state: GameState, random: () => number, _metalCapacity: () => number): string | null {
  const choices = EVENTS.filter(event => !event.tech || state.tech.includes(event.tech));
  state.eventIn = sampleEventInterval(random);
  if (!choices.length) return null;
  const event = choices[Math.floor(random() * choices.length)];
  return event?.name ?? null;
}
