import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTechTree, KEY_TECHNOLOGIES } from '../src/vue/tech-tree';
import { TECHNOLOGIES } from '../src/data/technologies';
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
    assert.equal(new Set(nodes.map(n => n.y)).size, 1);
    assert.equal(new Set(nodes.map(n => n.x)).size, nodes.length);
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
test('a lone dependency uses the theme stroke, with no artificial colour', () => {
  const tree = layoutTechTree(['survival', 'tools']);
  assert.equal(tree.edges.length, 1);
  const edge = tree.edges[0];
  assert.ok(edge);
  assert.equal(edge.stroke, 'var(--text)');
  assert.equal(edge.dash, '');
  assert.equal(layoutTechTree([]).nodes.length, 0);
});
