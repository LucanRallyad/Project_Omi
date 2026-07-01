/**
 * Graph view styling and physics — Obsidian Graph View defaults.
 *
 * Factory defaults (`.obsidian/graph.json` → Restore default settings):
 *   centerStrength 0.5, repelStrength 10, linkStrength 1, linkDistance 250
 *   nodeSizeMultiplier 1, lineSizeMultiplier 1, textFadeMultiplier 0, showArrow false
 *
 * Node diameter: nodeSizeMultiplier × max(8, min(3√(weight+1), 30))
 * @see https://obsidian.md/help/plugins/graph
 * @see https://forum.obsidian.md/t/graph-view-physics-and-force-directed-graphs/72586
 */

export const OBSIDIAN_FORCES = {
  centerStrength: 0.5,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
  /**
   * Obsidian's engine maps repel 0–20 → internal charge 0…−200 (×10).
   * d3-force many-body is inverse-linear (not inverse-square), so the d3
   * equivalent for repel=10 is ≈−10, not −100.
   */
  repelD3ChargeScale: 1,
  /** d3 default: 1 - pow(alphaMin, 1/300) */
  alphaDecay: 0.0228,
  /** d3 default */
  velocityDecay: 0.6,
  alphaMin: 0.001,
  /** d3 default — keeps simulation warm while dragging a node. */
  dragAlphaTarget: 0.3,
  /** d3 default — prevents infinite force when nodes coincide. */
  chargeDistanceMin: 1,
  /** Obsidian culls distant pairs for performance. */
  chargeDistanceMax: Infinity,
  /** Small padding so node circles don't touch (implementation detail). */
  collidePadding: 2,
  collideStrength: 1,
  collideIterations: 2,
  /** Pre-settle before first paint (Obsidian animates ~60 frames then idles). */
  warmupTicks: 180,
  /** Stop applying forces below this — matches Obsidian idle cutoff. */
  sleepAlpha: 0.001,
  maxVelocity: 18,
} as const;

export const OBSIDIAN_DISPLAY = {
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  textFadeMultiplier: 0,
  showArrow: false,
  baseLinkThickness: 1,
} as const;

/** d3 many-body strength for a given Obsidian repel slider value. */
export function obsidianChargeStrength(
  repelStrength: number = OBSIDIAN_FORCES.repelStrength
): number {
  return -repelStrength * OBSIDIAN_FORCES.repelD3ChargeScale;
}

export interface GraphThemeColors {
  background: string;
  node: string;
  nodeCircle: string;
  line: string;
  text: string;
  nodeHighlight: string;
  lineHighlight: string;
  textHighlight: string;
  dimNode: string;
  dimLine: string;
  dimText: string;
  controlsBg: string;
  controlsBorder: string;
  controlsText: string;
  controlHover: string;
  controlActive: string;
}

/** Obsidian-style dark graph palette. */
export const GRAPH_COLORS_DARK: GraphThemeColors = {
  background: "#1e1e1e",
  node: "rgb(140, 133, 199)",
  nodeCircle: "rgba(255, 255, 255, 0.1)",
  line: "rgba(255, 255, 255, 0.09)",
  text: "rgba(173, 173, 173, 0.88)",
  nodeHighlight: "rgb(197, 181, 255)",
  lineHighlight: "rgba(124, 108, 240, 0.85)",
  textHighlight: "rgba(235, 235, 235, 0.98)",
  dimNode: "rgba(140, 133, 199, 0.12)",
  dimLine: "rgba(255, 255, 255, 0.03)",
  dimText: "rgba(173, 173, 173, 0.08)",
  controlsBg: "rgba(30, 30, 30, 0.92)",
  controlsBorder: "rgba(255, 255, 255, 0.08)",
  controlsText: "rgba(173, 173, 173, 0.9)",
  controlHover: "rgba(255, 255, 255, 0.05)",
  controlActive: "rgba(255, 255, 255, 0.1)",
};

/** Warm cream graph palette (matches app shell). */
export const GRAPH_COLORS_LIGHT: GraphThemeColors = {
  background: "#F5F0E8",
  node: "rgb(108, 88, 132)",
  nodeCircle: "rgba(61, 43, 31, 0.14)",
  line: "rgba(61, 43, 31, 0.16)",
  text: "rgba(61, 43, 31, 0.82)",
  nodeHighlight: "rgb(168, 64, 104)",
  lineHighlight: "rgba(168, 64, 104, 0.72)",
  textHighlight: "rgba(45, 32, 24, 0.95)",
  dimNode: "rgba(108, 88, 132, 0.18)",
  dimLine: "rgba(61, 43, 31, 0.06)",
  dimText: "rgba(61, 43, 31, 0.12)",
  controlsBg: "rgba(255, 252, 248, 0.94)",
  controlsBorder: "rgba(61, 43, 31, 0.12)",
  controlsText: "rgba(61, 43, 31, 0.82)",
  controlHover: "rgba(61, 43, 31, 0.06)",
  controlActive: "rgba(61, 43, 31, 0.1)",
};

/** @deprecated Use getGraphTheme() */
export const OBSIDIAN_COLORS = GRAPH_COLORS_DARK;

export function getGraphTheme(isDark: boolean): GraphThemeColors {
  return isDark ? GRAPH_COLORS_DARK : GRAPH_COLORS_LIGHT;
}

/** Color groups override default node fill (Obsidian groups feature). */
export const GRAPH_GROUP_COLORS_DARK: Record<string, string> = {
  romance: "rgb(212, 132, 154)",
  "rom-coms": "rgb(244, 194, 194)",
  booktok: "rgb(201, 169, 97)",
  lgbtq: "rgb(183, 148, 244)",
  favorites: "rgb(232, 184, 109)",
};

export const GRAPH_GROUP_COLORS_LIGHT: Record<string, string> = {
  romance: "rgb(168, 64, 104)",
  "rom-coms": "rgb(196, 120, 138)",
  booktok: "rgb(160, 120, 58)",
  lgbtq: "rgb(130, 90, 180)",
  favorites: "rgb(180, 120, 60)",
};

/** @deprecated Use getGraphGroupColors() */
export const OBSIDIAN_GROUP_COLORS = GRAPH_GROUP_COLORS_DARK;

export function getGraphGroupColors(isDark: boolean): Record<string, string> {
  return isDark ? GRAPH_GROUP_COLORS_DARK : GRAPH_GROUP_COLORS_LIGHT;
}

/**
 * Obsidian node diameter (px): multiplier × max(8, min(3√(weight+1), 30)).
 * weight = number of links to the node.
 */
export function obsidianNodeDiameter(degree: number): number {
  const size = 3 * Math.sqrt(degree + 1);
  return OBSIDIAN_DISPLAY.nodeSizeMultiplier * Math.max(8, Math.min(size, 30));
}

export function obsidianNodeRadius(degree: number): number {
  return obsidianNodeDiameter(degree) / 2;
}

/** World-space radius for collision / overlap resolution. */
export function collisionRadius(nodeRadius: number): number {
  return nodeRadius * OBSIDIAN_DISPLAY.nodeSizeMultiplier + OBSIDIAN_FORCES.collidePadding;
}

/** textFadeMultiplier (−3…3) → threshold 0…100; default 0 → 50. */
export function obsidianTextFadeThreshold(
  textFadeMultiplier: number = OBSIDIAN_DISPLAY.textFadeMultiplier
): number {
  return ((textFadeMultiplier + 3) / 6) * 100;
}

/**
 * Obsidian label opacity — fades in as on-screen diameter exceeds threshold.
 * @see Graph view → Display → Text fade threshold
 */
export function obsidianLabelOpacity(
  nodeRadius: number,
  scale: number,
  textFadeMultiplier: number = OBSIDIAN_DISPLAY.textFadeMultiplier
): number {
  const threshold = obsidianTextFadeThreshold(textFadeMultiplier);
  const screenDiameter = nodeRadius * 2 * scale * OBSIDIAN_DISPLAY.nodeSizeMultiplier;
  return Math.min(1, Math.max(0, (screenDiameter - threshold) / 24));
}

export function obsidianLinkWidth(isMobile = false): number {
  const mult = isMobile ? 1.35 : OBSIDIAN_DISPLAY.lineSizeMultiplier;
  return OBSIDIAN_DISPLAY.baseLinkThickness * mult;
}

/** Mobile: labels appear sooner when zoomed; desktop keeps Obsidian default. */
export function obsidianTextFadeForViewport(isMobile: boolean): number {
  return isMobile ? -1.5 : OBSIDIAN_DISPLAY.textFadeMultiplier;
}

export function obsidianHitPadding(isMobile: boolean, scale: number): number {
  return (isMobile ? 28 : 8) / scale;
}
