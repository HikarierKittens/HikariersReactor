import { TECHNOLOGIES } from '../data/technologies';
import { calculateTechnologyTier } from '../simulation/technology';
import type { TechnologyId } from '../types/technologies';

// Milestones highlighted in the previous interface, kept independent of prices.
export const KEY_TECHNOLOGIES = new Set<TechnologyId>([
  'writing', 'metallurgy', 'science', 'electricity', 'automation',
  'industrialization',
  'internet', 'nuclearEnergy', 'arpa', 'rocketry', 'oilTechnology',
]);
const COLORS = ['#f2f0e7', '#80bfff', '#d9ac43', '#efdf65', '#bc9167', '#ef9c51'];
type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };

/** Positive-length collinear overlap; touching at one endpoint is not a conflict. */
function overlaps(a: Segment, b: Segment): boolean {
  if (a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y) {
    return Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) < Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x));
  }
  if (a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x) {
    return Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) < Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y));
  }
  return false;
}

export function layoutTechTree(ids: readonly TechnologyId[]) {
  const grouped = new Map<number, TechnologyId[]>();
  for (const id of new Set(ids)) {
    const tier = calculateTechnologyTier(id);
    const group = grouped.get(tier) || [];
    group.push(id);
    grouped.set(tier, group);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  const levels = tiers.map((tier, index) => ({ tier, y: index * 110, ids: grouped.get(tier) ?? [] }));
  const nodes = levels.flatMap(level => level.ids.map((id, index) => ({ id, tier: level.tier, x: 12 + index * 200, y: level.y + 30 })));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const width = Math.max(184, ...nodes.map(node => node.x + 172));
  const edges = nodes.flatMap(node => TECHNOLOGIES[node.id].pre.flatMap(parentId => {
    const parent = byId.get(parentId);
    if (!parent) return [];
    const start = { x: parent.x + 80, y: parent.y + 40 };
    const end = { x: node.x + 80, y: node.y };
    // Route long edges outside the node columns so they never pass through buttons.
    const long = Math.abs(end.y - start.y) > 110;
    const lane = parent.x + 180;
    const points: Point[] = long
      ? [start, { x: start.x, y: start.y + 16 }, { x: lane, y: start.y + 16 }, { x: lane, y: end.y - 20 }, { x: end.x, y: end.y - 20 }, end]
      : [start, { x: start.x, y: end.y - 25 }, { x: end.x, y: end.y - 25 }, end];
    const segments: Segment[] = [];
    let previous: Point | undefined;
    for (const point of points) {
      if (previous && (previous.x !== point.x || previous.y !== point.y)) segments.push({ a: previous, b: point });
      previous = point;
    }
    return [{ id: `${parentId}-${node.id}`, parentId, childId: node.id, points, segments, variant: -1, stroke: 'var(--text)', dash: '', path: '' }];
  }));
  const conflicts = new Map(edges.map(edge => [edge, new Set<typeof edge>()]));
  for (const [i, edge] of edges.entries()) for (const other of edges.slice(i + 1)) {
    if (edge.segments.some(a => other.segments.some(b => overlaps(a, b)))) {
      conflicts.get(edge)?.add(other); conflicts.get(other)?.add(edge);
    }
  }
  edges.forEach(edge => {
    const overlapping = conflicts.get(edge);
    if (overlapping?.size) {
      const used = new Set([...overlapping].map(other => other.variant));
      let variant = 0;
      while (used.has(variant)) variant++;
      edge.variant = variant;
      edge.stroke = COLORS[variant % COLORS.length] ?? 'var(--text)';
      // Alternate solid/dashed lines in addition to colour. Offset shared lanes
      // slightly, otherwise a later solid SVG stroke would hide the earlier one.
      edge.dash = variant % 2 ? '5 3' : variant >= COLORS.length ? '2 3' : '';
      const offset = (variant - 2.5) * 2;
      const first = edge.points.at(0), last = edge.points.at(-1);
      if (first && last) edge.points = edge.points.map((point, index) => {
        if (index === 0 || index === edge.points.length - 1) return point;
        return { x: index === 1 ? first.x : index === edge.points.length - 2 ? last.x : point.x + offset, y: point.y + offset };
      });
    }
    edge.path = edge.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  });
  return { levels, nodes, edges, width: width + 24, height: levels.length * 110 + 8 };
}
