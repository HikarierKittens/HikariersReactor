import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { createInitialState } from '../src/state/create-state';
import { validateSaveQueue } from '../src/state/validate-queue';
import { buildingQueueUsage } from '../src/simulation/queue-settings';
import { requestPurchaseModule, settlePurchaseQueue, removeQueuedPurchase, describeQueuedPurchases, calculateQueueCost } from '../src/simulation/purchases';
import { estimateQueueTimes } from '../src/vue/queue-estimates';
import type { GameState, QueueItem } from '../src/types/state';
import type { ResourceId, ResourceAmounts } from '../src/types/economy';

function fresh() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('artificialIntelligenceII');
  s.talosMoonMissionCompleted = true;
  s.settings.unorderedBuildingQueue = false;
  return s;
}
function fund(s: GameState, units: number) {
  for (const [r, n] of Object.entries(BUILDINGS.aiSupercore.cost)) s.resources[r as ResourceId] = n * units;
}
function enqueue(s: GameState) {
  const result = requestPurchaseModule(s, 'build', 'aiSupercore', 0, true);
  assert.equal(result.status, 'queued');
  assert.ok(result.queued && result.queued.kind === 'build');
  return result.queued;
}

test('every enqueue is one ten-segment project and occupies exactly one shared construction slot', () => {
  const s = fresh();
  const a = enqueue(s), b = enqueue(s);
  assert.equal(a.segments, 10); assert.equal(b.segments, 10);
  assert.equal(s.queue.length, 2); assert.equal(buildingQueueUsage(s.queue), 2);
  assert.equal(requestPurchaseModule(s, 'build', 'aiSupercore', 0, true).status, 'queue-full');
  assert.equal(removeQueuedPurchase(s, a.uid)?.uid, a.uid);
  assert.equal(buildingQueueUsage(s.queue), 1);
  assert.equal(enqueue(s).segments, 10);
  assert.equal(new Set(s.queue.map(q => q.uid)).size, 2);
  assert.equal(buildingQueueUsage([{ uid: 1, kind: 'build', id: 'aiSupercore', segments: 100 }, { uid: 2, kind: 'arpa', id: 'rocketPlatform' }, { uid: 3, kind: 'tech', id: 'science' }] as QueueItem[]), 2);
});

test('partial sequential funding preserves project uid and remaining segments until all ten finish', () => {
  const s = fresh(), item = enqueue(s);
  fund(s, 3);
  const first = settlePurchaseQueue(s, 0);
  assert.equal(first.dirty, true);
  assert.equal(s.buildings.aiSupercore, 3);
  assert.equal(s.queue.length, 1);
  const remaining = s.queue[0]; assert.ok(remaining && remaining.kind === 'build');
  assert.equal(remaining.uid, item.uid); assert.equal(remaining.segments, 7);
  for (const r of Object.keys(BUILDINGS.aiSupercore.cost)) assert.equal(s.resources[r as ResourceId], 0);
  const stopped = settlePurchaseQueue(s, 0);
  assert.equal(stopped.dirty, false); assert.equal(s.buildings.aiSupercore, 3);
  fund(s, 7); settlePurchaseQueue(s, 0);
  assert.equal(s.buildings.aiSupercore, 10); assert.equal(s.queue.length, 0);
});

test('ordered projects reserve FIFO construction and cancellation drops only unpaid remainder', () => {
  const s = fresh(), a = enqueue(s), b = enqueue(s);
  fund(s, 12); settlePurchaseQueue(s, 0);
  assert.equal(s.buildings.aiSupercore, 12);
  assert.equal(s.queue.length, 1);
  const remaining = s.queue[0]; assert.ok(remaining && remaining.kind === 'build');
  assert.equal(remaining.uid, b.uid); assert.equal(remaining.segments, 8);
  assert.equal(s.queue.some(q => q.uid === a.uid), false);
  const before = { ...s.resources };
  removeQueuedPurchase(s, b.uid);
  assert.deepEqual(s.resources, before); assert.equal(s.buildings.aiSupercore, 12);
});

test('direct affordable purchase remains one segment while reservations clamp final enqueue', () => {
  const s = fresh(); fund(s, 1);
  assert.equal(requestPurchaseModule(s, 'build', 'aiSupercore', 0).status, 'buy-now');
  assert.equal(s.buildings.aiSupercore, 1); assert.equal(s.queue.length, 0);
  s.buildings.aiSupercore = 85;
  assert.equal(enqueue(s).segments, 10);
  assert.equal(enqueue(s).segments, 5);
  const first = s.queue[0]; assert.ok(first);
  removeQueuedPurchase(s, first.uid);
  assert.equal(enqueue(s).segments, 10);
  fund(s, 15); settlePurchaseQueue(s, 0);
  assert.equal(s.buildings.aiSupercore, 100); assert.equal(s.queue.length, 0);
  assert.equal(requestPurchaseModule(s, 'build', 'aiSupercore', 0, true).status, 'rejected');
});

test('remaining project costs and ETA use segment totals while storage requires only one segment', () => {
  const s = fresh(), a = enqueue(s);
  fund(s, 2); settlePurchaseQueue(s, 0);
  const display = describeQueuedPurchases(s)[0]; assert.ok(display);
  for (const [r, n] of Object.entries(BUILDINGS.aiSupercore.cost)) {
    assert.equal(display.cost[r as ResourceId], n * 8);
    assert.equal(calculateQueueCost(s, 'build', 'aiSupercore', 8)[r as ResourceId], n * 8);
  }
  const caps = { ...s.resources }, rates = { ...s.resources };
  for (const [r, n] of Object.entries(BUILDINGS.aiSupercore.cost)) { caps[r as ResourceId] = n; rates[r as ResourceId] = n; }
  const eta = estimateQueueTimes(s, rates as ResourceAmounts, caps as ResourceAmounts).get(a.uid)!;
  assert.ok(eta.startsWith('预计 '), eta);
  caps.nanotubes = BUILDINGS.aiSupercore.cost.nanotubes! - 1;
  assert.equal(estimateQueueTimes(s, rates, caps).get(a.uid), '储量上限不足');
});

test('new project saves preserve remaining counts and reject malformed or overreserved segments', () => {
  const s = fresh(); s.buildings.aiSupercore = 90;
  const raw = [{ uid: 42, kind: 'build', id: 'aiSupercore', segments: 7 }];
  assert.deepEqual(validateSaveQueue(raw, s), raw);
  for (const segments of [0, -1, .5, null, '7', 101, Infinity]) assert.throws(() => validateSaveQueue([{ ...raw[0], segments }], s));
  assert.throws(() => validateSaveQueue([{ ...raw[0], segments: 11 }], s));
});

test('legacy individual segments coalesce contiguous same-building runs without mutating input or crossing FIFO barriers', () => {
  const s = fresh();
  const raw = Array.from({ length: 100 }, (_, i) => ({ uid: i + 1, kind: 'build', id: 'aiSupercore' }));
  const original = structuredClone(raw);
  const restored = validateSaveQueue(raw, s);
  assert.deepEqual(raw, original);
  assert.equal(restored.length, 1);
  const first = restored[0]; assert.ok(first && first.kind === 'build');
  assert.equal(first.uid, 1); assert.equal(first.segments, 100);
  assert.equal(buildingQueueUsage(restored), 1);
  fund(s, 100); s.queue = restored; settlePurchaseQueue(s, 0);
  assert.equal(s.buildings.aiSupercore, 100); assert.equal(s.queue.length, 0);
  const separate = fresh(); separate.tech.push('survival');
  const interleaved = validateSaveQueue([{ uid: 1, kind: 'build', id: 'aiSupercore' }, { uid: 2, kind: 'build', id: 'nest' }, { uid: 3, kind: 'build', id: 'aiSupercore' }], separate);
  assert.deepEqual(interleaved.map(q => q.id), ['aiSupercore', 'nest', 'aiSupercore']);
  const beforeBarrier = interleaved[0], afterBarrier = interleaved[2];
  assert.ok(beforeBarrier && beforeBarrier.kind === 'build');
  assert.ok(afterBarrier && afterBarrier.kind === 'build');
  assert.equal(beforeBarrier.segments, 1); assert.equal(afterBarrier.segments, 1);
});
