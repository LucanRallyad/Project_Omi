/**
 * Obsidian Graph View defaults — sourced from .obsidian/graph.json factory settings
 * and Obsidian Help / ObsiViewer parameter mapping.
 *
 * Factory defaults:
 *   centerStrength 0.5, repelStrength 10, linkStrength 1, linkDistance 250
 *   nodeSizeMultiplier 1 (base 5px), lineSizeMultiplier 1 (base 1px)
 *   textFadeMultiplier 0, showArrow false
 */

export const OBSIDIAN_FORCES = {
  centerStrength: 0.5,
  repelStrength: 10,
  /** Maps to d3 charge: repelStrength * -20 */
  chargeStrength: -200,
  linkStrength: 1,
  linkDistance: 250,
  alphaDecay: 0.0228,
  velocityDecay: 0.4,
  alphaMin: 0.001,
} as const;

export const OBSIDIAN_DISPLAY = {
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  textFadeMultiplier: 0,
  showArrow: false,
  /** Base node diameter in px before multiplier & degree scaling. */
  baseNodeDiameter: 5,
  baseLinkThickness: 1,
} as const;

/** Obsidian dark-theme graph palette (WebGL/CSS bridge colors). */
export const OBSIDIAN_COLORS = {
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
} as const;

/** Color groups override default node fill (Obsidian groups feature). */
export const OBSIDIAN_GROUP_COLORS: Record<string, string> = {
  romance: "rgb(212, 132, 154)",
  "rom-coms": "rgb(244, 194, 194)",
  booktok: "rgb(201, 169, 97)",
  lgbtq: "rgb(183, 148, 244)",
  favorites: "rgb(232, 184, 109)",
};

export function obsidianNodeRadius(degree: number): number {
  const { baseNodeDiameter, nodeSizeMultiplier } = OBSIDIAN_DISPLAY;
  const base = (baseNodeDiameter / 2) * nodeSizeMultiplier;
  return base * (0.85 + Math.sqrt(degree + 1) * 0.45);
}

/** textFadeMultiplier (-3…3) → threshold 0…100; default 0 → 50. */
export function obsidianTextFadeThreshold(textFadeMultiplier: number = OBSIDIAN_DISPLAY.textFadeMultiplier): number {
  return ((textFadeMultiplier + 3) / 6) * 100;
}

/**
 * Obsidian label opacity — fades in as the node's on-screen diameter exceeds threshold.
 * Labels only appear when zoomed close enough (text fade threshold setting).
 */
export function obsidianLabelOpacity(
  nodeRadius: number,
  scale: number,
  textFadeMultiplier: number = OBSIDIAN_DISPLAY.textFadeMultiplier
): number {
  const threshold = obsidianTextFadeThreshold(textFadeMultiplier);
  const screenDiameter = nodeRadius * 2 * scale * OBSIDIAN_DISPLAY.nodeSizeMultiplier;
  return Math.min(1, Math.max(0, (screenDiameter - threshold) / 28));
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
