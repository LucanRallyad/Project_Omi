import type { GraphLink, GraphNode } from "./bookGraph";

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Render radius in graph space. */
  r: number;
}

export interface LayoutResult {
  nodes: SimNode[];
  links: GraphLink[];
}

const BASE_RADIUS = 4;
const DEGREE_RADIUS = 1.2;

function radiusForDegree(degree: number): number {
  return BASE_RADIUS + Math.sqrt(degree) * DEGREE_RADIUS;
}

/** Obsidian-style force-directed layout (center, repel, link springs). */
export function runForceLayout(
  nodes: GraphNode[],
  links: GraphLink[],
  iterations = 280
): LayoutResult {
  const nodeById = new Map<string, SimNode>();
  const count = nodes.length;
  const spread = Math.max(220, Math.sqrt(count) * 28);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const angle = (i / count) * Math.PI * 2 + (i % 7) * 0.15;
    const ring = spread * (0.35 + (i % 5) * 0.12);
    nodeById.set(n.id, {
      ...n,
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
      vx: 0,
      vy: 0,
      r: radiusForDegree(n.degree),
    });
  }

  const simLinks = links
    .map((l) => {
      const a = nodeById.get(l.source);
      const b = nodeById.get(l.target);
      if (!a || !b) return null;
      return { ...l, a, b };
    })
    .filter(Boolean) as Array<GraphLink & { a: SimNode; b: SimNode }>;

  let alpha = 1;
  const alphaMin = 0.001;
  const alphaDecay = 1 - Math.pow(alphaMin, 1 / iterations);

  const centerStrength = 0.04;
  const repelStrength = -420;
  const linkDistance = 72;
  const linkStrengthByKind = { series: 0.85, author: 0.45, tag: 0.35 } as const;
  const velocityDecay = 0.58;

  const simNodes = [...nodeById.values()];

  for (let tick = 0; tick < iterations; tick++) {
    // Center gravity — keeps the graph compact.
    for (const node of simNodes) {
      node.vx += -node.x * centerStrength * alpha;
      node.vy += -node.y * centerStrength * alpha;
    }

    // Repulsion — nodes push each other apart.
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const a = simNodes[i];
        const b = simNodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          distSq = 1;
          dx = (Math.random() - 0.5) * 0.01;
          dy = (Math.random() - 0.5) * 0.01;
        }
        const force = (repelStrength * alpha) / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Link springs — pull connected books together.
    for (const link of simLinks) {
      const { a, b } = link;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.001);
      const strength = linkStrengthByKind[link.kind] * alpha;
      const delta = (dist - linkDistance) / dist;
      dx *= delta * strength;
      dy *= delta * strength;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }

    // Integrate velocities.
    for (const node of simNodes) {
      node.vx *= velocityDecay;
      node.vy *= velocityDecay;
      node.x += node.vx;
      node.y += node.vy;
    }

    alpha *= alphaDecay;
  }

  return { nodes: simNodes, links };
}
