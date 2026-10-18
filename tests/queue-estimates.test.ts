import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { advanceGameTick } from '../src/simulation/tick';
import { queuePurchase, settlePurchaseQueue } from '../src/simulation/purchases';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { estimateQueueTimes } from '../src/vue/queue-estimates';
import type { GameState } from '../src/types/state';
import type { ResourceAmounts } from '../src/types/economy';

function state(): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  s.tech.push('science', 'artificialIntelligenceII');
  s.buildings.lab = 200; s.workers.lab = 200;
  return s;
}

function etaSeconds(text: string | undefined): number {
  if (!text) return NaN;
  let match = text.match(/(\d+) min (\d+) s/);
  if (match) return +(match[1] ?? 0) * 60 + +(match[2] ?? 0);
  match = text.match(/(\d+) s/);
  return match ? +(match[1] ?? 0) : NaN;
}

const hooks = (s: GameState) => ({
  happiness: () => s.happiness,
  capacity: () => 1000,
  event: () => {}, projects: () => {},
  purchases: () => { settlePurchaseQueue(s, () => calculateSupportPreview(s).moon.available); },
  unlocks: () => {},
});

test('queue estimate uses the live tick horizon, so its countdown tracks real seconds', () => {
  const s = state();
  assert.equal(queuePurchase(s, 'tech', 'quantumSwarm').status, 'queued');
  const caps = Object.fromEntries(Object.keys(s.resources).map(id => [id, Infinity])) as ResourceAmounts;
  const estimate = () => [...estimateQueueTimes(s, calculateProduction(s, CONFIG.uiStepSeconds).rates, caps).values()][0];
  assert.ok(etaSeconds(estimate()) > 0, `expected a countdown, got ${estimate()}`);
  const startTime = s.time, startEta = etaSeconds(estimate());
  for (let i = 0; i < 50; i++) advanceGameTick(s, CONFIG.uiStepSeconds, hooks(s));
  const elapsed = s.time - startTime;
  const dropped = startEta - etaSeconds(estimate());
  assert.ok(Math.abs(dropped - elapsed) <= 1.5, `countdown dropped ${dropped}s over ${elapsed}s`);
  const preview = calculateProduction(s, CONFIG.uiStepSeconds).rates.knowledge;
  const whole = calculateProduction(s, 1).rates.knowledge;
  assert.ok(Math.abs(preview - whole) < 1e-7, `preview horizons disagree: ${preview} vs ${whole}`);
});
