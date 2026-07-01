import type { TasteWeight } from "../types";
import { buildTasteProfile, tasteWeightsFromProfile } from "./libraryProfile";

export function mergeWeights(base: TasteWeight[], delta: TasteWeight[]): TasteWeight[] {
  const map = new Map<string, TasteWeight>();
  for (const w of base) map.set(`${w.feature_type}:${w.feature_value}`, { ...w });
  for (const d of delta) {
    const key = `${d.feature_type}:${d.feature_value}`;
    const existing = map.get(key);
    if (existing) existing.weight += d.weight;
    else map.set(key, { ...d });
  }
  return [...map.values()].filter((w) => Math.abs(w.weight) > 0.01);
}

/** Pull in-app swipe deltas out of a combined weight set (one-time migration). */
export function extractSwipeDeltas(stored: TasteWeight[]): TasteWeight[] {
  const baseline = tasteWeightsFromProfile(buildTasteProfile());
  const baseByKey = new Map(
    baseline.map((w) => [`${w.feature_type}:${w.feature_value}`, w.weight])
  );
  const deltas: TasteWeight[] = [];
  for (const w of stored) {
    const key = `${w.feature_type}:${w.feature_value}`;
    const base = baseByKey.get(key) ?? 0;
    const delta = w.weight - base;
    if (Math.abs(delta) > 0.01) {
      deltas.push({ ...w, weight: delta });
    }
  }
  return deltas;
}
