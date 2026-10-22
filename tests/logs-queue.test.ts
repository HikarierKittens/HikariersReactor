/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import { CONFIG } from '../src/data/config';
import assert from 'node:assert/strict';
import { validateHistory } from '../src/state/validate-history';
import { test } from 'node:test';
import { describeQueuedPurchases, removeQueuedPurchase } from '../src/simulation/purchases';
import { calculateBuildingCost } from '../src/simulation/costs';
import { createInitialState } from '../src/state/create-state';

test('display history preserves explicit event and queue log types', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  const raw = { ...s, logs: [{ time: 0, text: '队列中 猫窝 已完成', type: 'event' }, { time: 1, text: '一只猫猫饿死了.....', type: 'event' }, { time: 2, text: '队列中 学校 已完成', type: 'queue' }] };
  validateHistory(raw, s);
  assert.deepEqual(s.logs.map(log => log.type), ['event', 'event', 'queue']);
});

test('duplicate queued building prices reindex after middle cancellation and completion', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.warehouse = 3;
  s.queue = [1, 2, 3, 4].map(uid => ({ uid, kind: 'build' as const, id: 'warehouse' as const }));
  const quote = () => describeQueuedPurchases(s).filter(item => item.kind === 'build');
  const before = quote();
  for (let i = 0; i < 4; i++) assert.deepEqual(before[i]!.cost, calculateBuildingCost('warehouse', 3 + i, s));
  removeQueuedPurchase(s, 2);
  const after = quote();
  assert.deepEqual(after.map(item => item.uid), [1, 3, 4]);
  assert.deepEqual(after.map(item => item.cost), before.slice(0, 3).map(item => item.cost));
  s.queue.unshift({ uid: 9, kind: 'build', id: 'nest' });
  assert.deepEqual(quote().filter(item => item.id === 'warehouse').map(item => item.cost), after.map(item => item.cost), 'other buildings do not shift same-kind prices');
  s.buildings.warehouse++; removeQueuedPurchase(s, 1);
  assert.deepEqual(quote().filter(item => item.id === 'warehouse').map(item => item.cost), after.slice(1).map(item => item.cost), 'completion keeps later projected prices stable');
});
