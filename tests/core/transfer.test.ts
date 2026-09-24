import { describe, expect, it } from "vitest";
import {
  validateCustomPreset,
  withUniqueName,
  uniqueName,
} from "../../src/core/customPresets.ts";
import { newGame, newGameWithBoard, reduce } from "../../src/core/rules.ts";
import { generateBoard } from "../../src/core/generator.ts";
import { deserializeGame, isResumable, serializeGame } from "../../src/core/save.ts";
import {
  applyImport,
  buildBundle,
  parseBundle,
  serializeBundle,
} from "../../src/core/transfer.ts";

const VALID = { name: "我的预设", width: 5, height: 5, mines: 3 };

describe("custom presets", () => {
  it("validates dimensions, mines, and area", () => {
    expect(validateCustomPreset(VALID).ok).toBe(true);
    expect(validateCustomPreset({ ...VALID, width: 2 }).ok).toBe(false);
    expect(validateCustomPreset({ ...VALID, mines: 0 }).ok).toBe(false);
    expect(validateCustomPreset({ ...VALID, mines: 5 * 5 - 8 }).ok).toBe(false);
    expect(validateCustomPreset({ ...VALID, name: "  " }).ok).toBe(false);
    expect(validateCustomPreset({ name: "big", width: 200, height: 200, mines: 10 }).ok).toBe(
      false,
    );
  });

  it("de-duplicates names", () => {
    expect(uniqueName("名称", [])).toBe("名称");
    expect(uniqueName("名称", ["名称"])).toBe("名称 (2)");
    expect(uniqueName("名称", ["名称", "名称 (2)"])).toBe("名称 (3)");
    const validated = validateCustomPreset(VALID);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      const renamed = withUniqueName(validated.preset, [
        { ...validated.preset, id: "x", name: "我的预设" },
      ]);
      expect(renamed.name).toBe("我的预设 (2)");
    }
  });
});

describe("save round-trip", () => {
  it("restores an in-progress game exactly", () => {
    const config = { width: 5, height: 5, mines: 3 };
    const started = reduce(newGame(config, 1, "training"), {
      type: "start",
      board: generateBoard(config, 1, 12),
      firstIndex: 12,
    });
    const playing = reduce(started, { type: "reveal", index: 12 });
    const serialized = serializeGame(playing, 1234, 99);
    const restored = deserializeGame(serialized);
    expect(restored).toEqual(playing);
    expect(isResumable(serialized)).toBe(true);
  });

  it("does not treat a finished game as resumable", () => {
    const adjacency = [0, 0, 0, 0, 1, 1, 0, 1, 0];
    const board = {
      width: 3,
      height: 3,
      mines: 1,
      cells: adjacency.map((adjacent, index) => ({ mine: index === 8, adjacent })),
    };
    const started = newGameWithBoard(
      { width: 3, height: 3, mines: 1 },
      board,
      1,
      0,
      "challenge",
    );
    const won = reduce(started, { type: "reveal", index: 0 });
    expect(won.status).toBe("won");
    expect(isResumable(serializeGame(won, 10))).toBe(false);
  });
});

describe("import / export", () => {
  const preset = validateCustomPreset(VALID);
  const presetList = preset.ok ? [preset.preset] : [];

  it("round-trips a presets-only export", () => {
    const json = serializeBundle(buildBundle({ presets: presetList, presetsOnly: true }));
    const parsed = parseBundle(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle.presets).toHaveLength(1);
      expect(parsed.bundle.records).toHaveLength(0);
      expect(parsed.bundle.save).toBeNull();
    }
  });

  it("rejects corrupt data wholesale", () => {
    expect(parseBundle("{not json")).toEqual({ ok: false, reason: "不是有效的 JSON 数据" });
    expect(parseBundle("null")).toEqual({ ok: false, reason: "数据格式无效" });
    const badPreset = JSON.stringify({
      schemaVersion: 1,
      presets: [{ name: "坏", width: 2, height: 2, mines: 1 }],
    });
    expect(parseBundle(badPreset).ok).toBe(false);
  });

  it("rejects unknown/newer schema versions and unknown older ones", () => {
    expect(parseBundle(JSON.stringify({ schemaVersion: 99 })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({ schemaVersion: 0 })).ok).toBe(false);
    expect(parseBundle(JSON.stringify({})).ok).toBe(false);
  });

  it("merges by de-duplicating ids and renaming colliding names", () => {
    const local = buildBundle({ presets: presetList });
    const incoming = buildBundle({
      presets: [
        { ...presetList[0], id: "other", name: "我的预设" },
        { ...presetList[0], id: "third", name: "别的" },
      ],
    });
    const merged = applyImport(local, incoming, "merge");
    expect(merged.presets).toHaveLength(3);
    expect(merged.presets.map((p) => p.name)).toContain("我的预设 (2)");
  });

  it("replaces everything in replace mode", () => {
    const local = buildBundle({ presets: presetList });
    const incoming = buildBundle({ presets: [] });
    const replaced = applyImport(local, incoming, "replace");
    expect(replaced.presets).toHaveLength(0);
  });
});
