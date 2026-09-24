import {
  type CustomPreset,
  MAX_AREA,
  validateCustomPreset,
  uniqueName,
} from "./customPresets.ts";
import type { GameRecord } from "./records.ts";
import { isCompatibleSave, type SavedGame } from "./save.ts";

export const DATA_SCHEMA_VERSION = 1;

export interface DataBundle {
  schemaVersion: number;
  exportedAt: number;
  presets: CustomPreset[];
  records: GameRecord[];
  save: SavedGame | null;
}

export type ImportMode = "merge" | "replace";

export type ParseResult =
  | { ok: true; bundle: DataBundle }
  | { ok: false; reason: string };

export function emptyBundle(now = 0): DataBundle {
  return { schemaVersion: DATA_SCHEMA_VERSION, exportedAt: now, presets: [], records: [], save: null };
}

export function serializeBundle(bundle: DataBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function buildBundle(input: {
  presets?: CustomPreset[];
  records?: GameRecord[];
  save?: SavedGame | null;
  presetsOnly?: boolean;
  now?: number;
}): DataBundle {
  const now = input.now ?? 0;
  const base = emptyBundle(now);
  return {
    ...base,
    presets: input.presets ?? [],
    records: input.presetsOnly ? [] : input.records ?? [],
    save: input.presetsOnly ? null : input.save ?? null,
  };
}

export function parseBundle(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: "不是有效的 JSON 数据" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "数据格式无效" };
  }
  const candidate = raw as Partial<DataBundle>;
  const version = candidate.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { ok: false, reason: "缺少 schemaVersion" };
  }
  if (version > DATA_SCHEMA_VERSION) {
    return { ok: false, reason: "数据来自更高的版本，无法导入" };
  }
  if (version < 1) {
    return { ok: false, reason: "不支持的旧版本数据" };
  }

  const presets: CustomPreset[] = [];
  if (candidate.presets !== undefined) {
    if (!Array.isArray(candidate.presets)) return { ok: false, reason: "预设列表无效" };
    for (const entry of candidate.presets) {
      if (typeof entry !== "object" || entry === null) return { ok: false, reason: "预设项无效" };
      const item = entry as Partial<CustomPreset>;
      const result = validateCustomPreset({
        id: typeof item.id === "string" ? item.id : undefined,
        name: typeof item.name === "string" ? item.name : "",
        width: Number(item.width),
        height: Number(item.height),
        mines: Number(item.mines),
        createdAt: typeof item.createdAt === "number" ? item.createdAt : undefined,
      });
      if (!result.ok) {
        return { ok: false, reason: `预设“${String(item.name)}”不合法（${result.reason}）` };
      }
      if (result.preset.width * result.preset.height > MAX_AREA) {
        return { ok: false, reason: "预设面积超出上限" };
      }
      presets.push(result.preset);
    }
  }

  const records: GameRecord[] = [];
  if (candidate.records !== undefined) {
    if (!Array.isArray(candidate.records)) return { ok: false, reason: "记录列表无效" };
    for (const entry of candidate.records) {
      if (typeof entry !== "object" || entry === null) return { ok: false, reason: "记录项无效" };
      const item = entry as Partial<GameRecord>;
      const preset = item.preset as GameRecord["preset"] | undefined;
      const aids = item.aids as GameRecord["aids"] | undefined;
      const validPreset =
        typeof preset === "object" &&
        preset !== null &&
        typeof preset.width === "number" &&
        typeof preset.height === "number" &&
        typeof preset.mines === "number";
      const validAids =
        typeof aids === "object" &&
        aids !== null &&
        typeof aids.hint === "number" &&
        typeof aids.smart === "number" &&
        typeof aids.leader === "number" &&
        typeof aids.revives === "number";
      if (
        typeof item.id !== "string" ||
        typeof item.durationMs !== "number" ||
        typeof item.timestamp !== "number" ||
        typeof item.valid !== "boolean" ||
        (item.mode !== "training" && item.mode !== "challenge") ||
        (item.outcome !== "won" && item.outcome !== "lost" && item.outcome !== "abandoned") ||
        !validPreset ||
        !validAids
      ) {
        return { ok: false, reason: "记录项字段缺失" };
      }
      records.push(item as GameRecord);
    }
  }

  let save: SavedGame | null = null;
  if (candidate.save !== undefined && candidate.save !== null) {
    if (!isCompatibleSave(candidate.save)) return { ok: false, reason: "存档格式不兼容" };
    save = candidate.save;
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: DATA_SCHEMA_VERSION,
      exportedAt: typeof candidate.exportedAt === "number" ? candidate.exportedAt : 0,
      presets,
      records,
      save,
    },
  };
}

export function mergeBundles(local: DataBundle, incoming: DataBundle): DataBundle {
  const presetIds = new Set(local.presets.map((preset) => preset.id));
  const names = local.presets.map((preset) => preset.name);
  const presets = [...local.presets];
  for (const preset of incoming.presets) {
    if (presetIds.has(preset.id)) continue;
    const name = uniqueName(preset.name, names);
    names.push(name);
    presetIds.add(preset.id);
    presets.push({ ...preset, name });
  }

  const recordIds = new Set(local.records.map((record) => record.id));
  const records = [...local.records];
  for (const record of incoming.records) {
    if (recordIds.has(record.id)) continue;
    recordIds.add(record.id);
    records.push(record);
  }

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: incoming.exportedAt,
    presets,
    records,
    save: local.save,
  };
}

export function applyImport(
  local: DataBundle,
  incoming: DataBundle,
  mode: ImportMode,
): DataBundle {
  if (mode === "replace") return incoming;
  return mergeBundles(local, incoming);
}
