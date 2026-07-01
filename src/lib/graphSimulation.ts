import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphLink, GraphNode } from "./bookGraph";
import {
  collisionRadius,
  OBSIDIAN_FORCES,
  obsidianChargeStrength,
  obsidianNodeRadius,
} from "./obsidianGraphConfig";

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
  r: number;
}

export interface SimLink {
  link: GraphLink;
  a: SimNode;
  b: SimNode;
}

interface SimLinkDatum extends SimulationLinkDatum<SimNode> {
  link: GraphLink;
}

/**
 * Force-directed layout via d3-force (Obsidian's original graph engine).
 * @see https://obsidian.md/help/plugins/graph
 */
export class GraphSimulation {
  readonly nodes: SimNode[];
  private readonly linkData: SimLinkDatum[];
  private readonly simulation: Simulation<SimNode, SimLinkDatum>;
  private pinnedCount = 0;
  private active = true;

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    const nodeById = new Map<string, SimNode>();
    const count = nodes.length;
    const spread = Math.min(48, 10 + Math.sqrt(count) * 2.5);

    // Obsidian "big bang" — nodes start close with random jitter, velocity 0.
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      nodeById.set(n.id, {
        ...n,
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        r: obsidianNodeRadius(n.degree),
      });
    }

    this.nodes = [...nodeById.values()];
    this.linkData = links
      .map((link) => {
        const source = nodeById.get(link.source);
        const target = nodeById.get(link.target);
        if (!source || !target) return null;
        return { source, target, link };
      })
      .filter(Boolean) as SimLinkDatum[];

    this.simulation = forceSimulation(this.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLinkDatum>(this.linkData)
          .id((d) => d.id)
          .distance(OBSIDIAN_FORCES.linkDistance)
          .strength(OBSIDIAN_FORCES.linkStrength)
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength(obsidianChargeStrength())
          .distanceMin(OBSIDIAN_FORCES.chargeDistanceMin)
          .distanceMax(OBSIDIAN_FORCES.chargeDistanceMax)
      )
      .force("center", forceCenter<SimNode>(0, 0).strength(OBSIDIAN_FORCES.centerStrength))
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((d) => collisionRadius(d.r))
          .strength(OBSIDIAN_FORCES.collideStrength)
          .iterations(OBSIDIAN_FORCES.collideIterations)
      )
      .alpha(1)
      .alphaDecay(OBSIDIAN_FORCES.alphaDecay)
      .alphaMin(OBSIDIAN_FORCES.alphaMin)
      .velocityDecay(OBSIDIAN_FORCES.velocityDecay);

    this.simulation.stop();
    this.warmup();
  }

  get simLinks(): SimLink[] {
    return this.linkData.map((datum) => ({
      link: datum.link,
      a: datum.source as SimNode,
      b: datum.target as SimNode,
    }));
  }

  get alpha(): number {
    return this.simulation.alpha();
  }

  get isActive(): boolean {
    return this.active;
  }

  reheat(strength = 0.3): void {
    this.active = true;
    this.simulation.alpha(Math.max(this.simulation.alpha(), strength));
  }

  grabNode(node: SimNode, x: number, y: number): void {
    const wasPinned = node.fx != null && node.fy != null;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    if (!wasPinned) this.pinnedCount += 1;
    this.active = true;
    this.simulation.alphaTarget(OBSIDIAN_FORCES.dragAlphaTarget);
    if (!wasPinned) this.reheat(OBSIDIAN_FORCES.dragAlphaTarget);
  }

  moveNode(node: SimNode, x: number, y: number): void {
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
  }

  unpinNode(node: SimNode): void {
    if (node.fx != null) this.pinnedCount = Math.max(0, this.pinnedCount - 1);
    node.fx = null;
    node.fy = null;
    node.vx = 0;
    node.vy = 0;
    if (this.pinnedCount === 0) {
      this.simulation.alphaTarget(0);
      this.simulation.alpha(Math.min(this.simulation.alpha(), 0.08));
    }
    this.resolveOverlaps();
    this.active = true;
  }

  step(): boolean {
    if (!this.active) return false;

    const alpha = this.simulation.alpha();
    if (alpha <= OBSIDIAN_FORCES.sleepAlpha && this.pinnedCount === 0) {
      this.sleep();
      return false;
    }

    const iterations = alpha > 0.5 ? 3 : alpha > 0.1 ? 2 : 1;
    this.simulation.tick(iterations);
    this.clampVelocities();
    this.maybeSleep();
    return this.active;
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

  private warmup(): void {
    for (let i = 0; i < OBSIDIAN_FORCES.warmupTicks && this.simulation.alpha() > 0.04; i++) {
      this.simulation.tick(2);
      this.clampVelocities();
    }
    this.resolveOverlaps();
    this.zeroVelocities();
    this.simulation.alpha(0);
    this.active = false;
  }

  private sleep(): void {
    this.zeroVelocities();
    this.simulation.alpha(0);
    this.simulation.alphaTarget(0);
    this.active = false;
  }

  private maybeSleep(): void {
    if (this.pinnedCount > 0) return;
    const alpha = this.simulation.alpha();
    if (alpha > OBSIDIAN_FORCES.sleepAlpha) return;
    const moving = this.nodes.some(
      (n) => Math.abs(n.vx ?? 0) > 0.02 || Math.abs(n.vy ?? 0) > 0.02
    );
    if (!moving) this.sleep();
  }

  private zeroVelocities(): void {
    for (const node of this.nodes) {
      node.vx = 0;
      node.vy = 0;
    }
  }

  private clampVelocities(): void {
    const max = OBSIDIAN_FORCES.maxVelocity;
    const maxSq = max * max;
    for (const node of this.nodes) {
      if (node.fx != null) continue;
      const vx = node.vx ?? 0;
      const vy = node.vy ?? 0;
      const magSq = vx * vx + vy * vy;
      if (magSq > maxSq) {
        const scale = max / Math.sqrt(magSq);
        node.vx = vx * scale;
        node.vy = vy * scale;
      }
    }
  }

  private resolveOverlaps(): void {
    const nodes = this.nodes;
    const n = nodes.length;
    const radii = nodes.map((node) => collisionRadius(node.r));

    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const minDist = radii[i] + radii[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);

          if (dist < 1e-6) {
            const angle = (i + j) * 2.399963;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }

          if (dist >= minDist) continue;

          const overlap = (minDist - dist) / dist;
          const ox = dx * overlap;
          const oy = dy * overlap;
          const aPinned = a.fx != null;
          const bPinned = b.fx != null;

          if (aPinned && bPinned) continue;
          if (aPinned && !bPinned) {
            b.x += ox;
            b.y += oy;
          } else if (!aPinned && bPinned) {
            a.x -= ox;
            a.y -= oy;
          } else {
            a.x -= ox * 0.5;
            a.y -= oy * 0.5;
            b.x += ox * 0.5;
            b.y += oy * 0.5;
          }
        }
      }
    }
  }
}
