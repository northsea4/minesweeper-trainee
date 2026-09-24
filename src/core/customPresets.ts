import type { BoardConfig } from "./types.ts";

export const MAX_AREA = 10_000;
/** Measured reliably-no-guess density cap (see docs/perf/baseline.md). */
export const MAX_DENSITY = 0.38;

export interface CustomPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  mines: number;
  createdAt: number;
}

export type PresetValidation =
  | { ok: true; preset: CustomPreset }
  | { ok: false; reason: "dimensions" | "mines" | "area" | "density" | "name" };

export function validateCustomPreset(
  input: {
    id?: string;
    name: string;
    width: number;
    height: number;
    mines: number;
    createdAt?: number;
  },
  now = 0,
): PresetValidation {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, reason: "name" };
  const { width, height, mines } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return { ok: false, reason: "dimensions" };
  }
  if (width < 3 || height < 3) return { ok: false, reason: "dimensions" };
  if (width * height > MAX_AREA) return { ok: false, reason: "area" };
  if (!Number.isInteger(mines) || mines < 1 || mines > width * height - 9) {
    return { ok: false, reason: "mines" };
  }
  if (mines > width * height * MAX_DENSITY) {
    return { ok: false, reason: "density" };
  }
  return {
    ok: true,
    preset: {
      id: input.id ?? `preset-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      width,
      height,
      mines,
      createdAt: input.createdAt ?? now,
    },
  };
}

export function uniqueName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  let suffix = 2;
  while (taken.has(`${name} (${suffix})`)) suffix++;
  return `${name} (${suffix})`;
}

export function withUniqueName(preset: CustomPreset, existing: readonly CustomPreset[]): CustomPreset {
  const name = uniqueName(preset.name, existing.map((p) => p.name));
  return name === preset.name ? preset : { ...preset, name };
}

export function presetToConfig(preset: CustomPreset): BoardConfig {
  return { width: preset.width, height: preset.height, mines: preset.mines };
}
