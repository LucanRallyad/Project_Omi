import type { GraphLink, GraphNode } from "./bookGraph";
import { OBSIDIAN_FORCES, obsidianNodeRadius } from "./obsidianGraphConfig";

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  r: number;
}

export interface SimLink {
  link: GraphLink;
  a: SimNode;
  b: SimNode;
}

/**
 * Live force simulation matching Obsidian Graph View factory physics.
 * Uses velocity Verlet integration (d3-force pattern) with Obsidian graph.json defaults.
 */
export class GraphSimulation {
  readonly nodes: SimNode[];
  readonly simLinks: SimLink[];

  alpha = 1;
  alphaMin = OBSIDIAN_FORCES.alphaMin;
  alphaTarget = 0;
  alphaDecay = OBSIDIAN_FORCES.alphaDecay;
  velocityDecay = OBSIDIAN_FORCES.velocityDecay;

  centerStrength = OBSIDIAN_FORCES.centerStrength;
  chargeStrength = OBSIDIAN_FORCES.chargeStrength;
  linkDistance = OBSIDIAN_FORCES.linkDistance;
  linkStrength = OBSIDIAN_FORCES.linkStrength;

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    const nodeById = new Map<string, SimNode>();
    const count = nodes.length;
    const spread = Math.max(400, Math.sqrt(count) * 40);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const angle = (i / count) * Math.PI * 2 + (i % 7) * 0.12;
      const ring = spread * (0.4 + (i % 5) * 0.1);
      nodeById.set(n.id, {
        ...n,
        x: Math.cos(angle) * ring,
        y: Math.sin(angle) * ring,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        r: obsidianNodeRadius(n.degree),
      });
    }

    this.nodes = [...nodeById.values()];
    this.simLinks = links
      .map((link) => {
        const a = nodeById.get(link.source);
        const b = nodeById.get(link.target);
        if (!a || !b) return null;
        return { link, a, b };
      })
      .filter(Boolean) as SimLink[];
  }

  reheat(strength = 0.3): void {
    this.alpha = Math.min(1, Math.max(this.alpha, strength));
  }

  pinNode(node: SimNode, x: number, y: number): void {
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    this.reheat(0.5);
  }

  unpinNode(node: SimNode): void {
    node.fx = null;
    node.fy = null;
    this.reheat(0.35);
  }

  tick(): boolean {
    const hasPinned = this.nodes.some((n) => n.fx != null);
    if (this.alpha < this.alphaMin && !hasPinned) return false;

    const alpha = this.alpha;
    const n = this.nodes.length;

    // Center force — Obsidian "center force" slider.
    for (const node of this.nodes) {
      if (node.fx != null) continue;
      node.vx += -node.x * this.centerStrength * alpha * 0.08;
      node.vy += -node.y * this.centerStrength * alpha * 0.08;
    }

    // Many-body charge — Obsidian "repel force" (Coulomb, inverse square).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          distSq = 1;
          dx = (Math.random() - 0.5) * 0.01;
          dy = (Math.random() - 0.5) * 0.01;
        }
        const force = (this.chargeStrength * alpha) / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.fx == null) {
          a.vx += fx;
          a.vy += fy;
        }
        if (b.fx == null) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    // Link force — uniform spring strength (Obsidian "link force" + "link distance").
    for (const { a, b } of this.simLinks) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.001);
      const strength = this.linkStrength * alpha;
      const delta = ((dist - this.linkDistance) / dist) * strength;
      dx *= delta;
      dy *= delta;
      if (a.fx == null) {
        a.vx += dx;
        a.vy += dy;
      }
      if (b.fx == null) {
        b.vx -= dx;
        b.vy -= dy;
      }
    }

    // Integrate (d3-force velocity Verlet).
    for (const node of this.nodes) {
      if (node.fx != null && node.fy != null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx *= this.velocityDecay;
      node.vy *= this.velocityDecay;
      node.x += node.vx;
      node.y += node.vy;
    }

    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    return true;
  }

  neighborsOf(nodeId: string): Set<string> {
    const set = new Set<string>([nodeId]);
    for (const { a, b } of this.simLinks) {
      if (a.id === nodeId) set.add(b.id);
      if (b.id === nodeId) set.add(a.id);
    }
    return set;
  }

  bounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      minY = Math.min(minY, node.y - node.r);
      maxY = Math.max(maxY, node.y + node.r);
    }
    return { minX, maxX, minY, maxY };
  }
}
