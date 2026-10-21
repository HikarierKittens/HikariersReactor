import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTechTree, KEY_TECHNOLOGIES, TECH_NODES_PER_ROW } from '../src/vue/tech-tree';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateTechnologyTier } from '../src/simulation/technology';
import type { TechnologyId } from '../src/types/technologies';

test('tree stacks tiers vertically and preserves same-tier horizontal rows', () => {
  const tree = layoutTechTree(Object.keys(TECHNOLOGIES) as TechnologyId[]);
  assert.equal(tree.nodes.length, Object.keys(TECHNOLOGIES).length);
  for (let i = 1; i < tree.levels.length; i++) {
    const current = tree.levels[i], previous = tree.levels[i - 1];
    assert.ok(current && previous);
    assert.ok(current.tier > previous.tier);
    assert.ok(current.y > previous.y);
  }
  for (const level of tree.levels) {
    const nodes = tree.nodes.filter(n => n.tier === level.tier);
    // A tier may wrap onto several rows (TECH_NODES_PER_ROW), so the invariant is
    // "at most that many nodes share a row" rather than "every node shares one row".
    const rows = new Map<number, number>();
    for (const node of nodes) rows.set(node.y, (rows.get(node.y) ?? 0) + 1);
    for (const count of rows.values()) assert.ok(count <= TECH_NODES_PER_ROW, `${level.tier}: ${count} nodes in one row`);
    assert.equal(rows.size, level.rows, `${level.tier} row count`);
    // Within a row the x positions stay distinct and evenly pitched.
    for (const y of rows.keys()) {
      const xs = nodes.filter(node => node.y === y).map(node => node.x).sort((a, b) => a - b);
      assert.equal(new Set(xs).size, xs.length);
      for (let i = 1; i < xs.length; i++) assert.equal(xs[i]! - xs[i - 1]!, 200);
    }
  }
  assert.equal(tree.edges.length, Object.values(TECHNOLOGIES).reduce((sum, tech) => sum + tech.pre.length, 0));
  assert.ok(tree.edges.some(edge => edge.stroke !== 'var(--text)'));
  assert.ok(tree.edges.some(edge => edge.dash));
  for (const edge of tree.edges) for (let i = 1; i < edge.points.length; i++) {
    const current = edge.points[i], previous = edge.points[i - 1];
    assert.ok(current && previous);
    assert.ok(current.x === previous.x || current.y === previous.y, 'connectors remain orthogonal');
  }
  assert.ok(KEY_TECHNOLOGIES.has('writing'));
});

test('a tier with more than ten technologies wraps instead of growing one wide row', () => {
  // T12–T15 hold 10–13 entries; before wrapping they produced a row wider than the viewport.
  const tree = layoutTechTree(Object.keys(TECHNOLOGIES) as TechnologyId[]);
  const wrapped = tree.levels.filter(level => level.rows > 1);
  assert.ok(wrapped.length > 0, 'the full tree must contain at least one wrapped tier');
  for (const level of wrapped) {
    const nodes = tree.nodes.filter(node => node.tier === level.tier);
    assert.ok(nodes.length > TECH_NODES_PER_ROW, `${level.tier} wraps only when it exceeds the row limit`);
    // Every row is at most ten wide, so the tree width never scales with the biggest tier.
    const rightmost = Math.max(...tree.nodes.map(node => node.x));
    assert.equal((rightmost - 12) / 200, TECH_NODES_PER_ROW - 1, 'the widest row holds exactly the row limit');
  }
  // Wrapped tiers push the next tier further down, and the total height accounts for it.
  const tallest = tree.levels.find(level => level.rows > 1)!;
  assert.ok(tree.levels.some(level => level.tier > tallest.tier && level.y >= tallest.y + 110));
  assert.ok(tree.height >= Math.max(...tree.nodes.map(node => node.y)) + 48);
  // A small hand-built tree stays a single row per tier.
  const small = layoutTechTree(['survival', 'tools', 'writing', 'mining']);
  for (const level of small.levels) assert.equal(level.rows, 1);
});
test('a lone dependency uses the theme stroke, with no artificial colour', () => {
  const tree = layoutTechTree(['survival', 'tools']);
  assert.equal(tree.edges.length, 1);
  const edge = tree.edges[0];
  assert.ok(edge);
  assert.equal(edge.stroke, 'var(--text)');
  assert.equal(edge.dash, '');
  assert.equal(layoutTechTree([]).nodes.length, 0);
});

test('digital T24/T25 display preserves same-tier prerequisite chains', () => {
  const initial = ['softRoutingNode', 'aes114514', 'digitalSimulation'] as const;
  const advanced = ['highPrecisionWorldSimulation', 'agi', 'digitalAscension'] as const;
  for (const id of initial) assert.equal(calculateTechnologyTier(id), 24, id);
  for (const id of advanced) assert.equal(calculateTechnologyTier(id), 25, id);
  assert.deepEqual(TECHNOLOGIES.softRoutingNode.pre, ['cellMultithreading']);
  assert.deepEqual(TECHNOLOGIES.aes114514.pre, ['cellMultithreading']);
  assert.deepEqual(TECHNOLOGIES.digitalSimulation.pre, ['cellMultithreading']);
  assert.deepEqual(TECHNOLOGIES.highPrecisionWorldSimulation.pre, ['digitalSimulation']);
  assert.deepEqual(TECHNOLOGIES.agi.pre, ['highPrecisionWorldSimulation']);
  assert.deepEqual(TECHNOLOGIES.digitalAscension.pre, ['agi']);
  const tree = layoutTechTree(['cellMultithreading', ...initial, ...advanced]);
  assert.equal(tree.nodes.length, 7);
  assert.equal(tree.edges.length, 6);
  for (const tier of [24, 25]) {
    const nodes = tree.nodes.filter(node => node.tier === tier);
    assert.equal(new Set(nodes.map(node => node.y)).size, 1);
    assert.equal(new Set(nodes.map(node => node.x)).size, nodes.length);
  }
  for (const edge of tree.edges) for (const point of edge.points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});
