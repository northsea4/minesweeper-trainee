import type { BoardConfig, BoardKey, GameMode, GameStatus } from "./types.ts";

export type Outcome = "won" | "lost" | "abandoned";

export interface AidUsage {
  hint: number;
  smart: number;
  leader: number;
  revives: number;
}

export interface GameRecord {
  id: string;
  preset: BoardConfig;
  boardKey: BoardKey | null;
  mode: GameMode;
  outcome: Outcome;
  durationMs: number;
  aids: AidUsage;
  valid: boolean;
  timestamp: number;
}

export function outcomeOf(status: GameStatus): Outcome | null {
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  if (status === "abandoned") return "abandoned";
  return null;
}

export function makeRecord(input: {
  id: string;
  config: BoardConfig;
  boardKey: BoardKey | null;
  mode: GameMode;
  outcome: Outcome;
  durationMs: number;
  aids: AidUsage;
  timestamp: number;
}): GameRecord {
  const valid = input.mode === "challenge" && input.outcome === "won";
  const { config, ...rest } = input;
  return { ...rest, preset: config, valid };
}

export function samePreset(a: BoardConfig, b: BoardConfig): boolean {
  return a.width === b.width && a.height === b.height && a.mines === b.mines;
}

export function personalBest(records: GameRecord[], preset: BoardConfig): GameRecord | null {
  let best: GameRecord | null = null;
  for (const record of records) {
    if (!record.valid || !samePreset(record.preset, preset)) continue;
    if (!best || record.durationMs < best.durationMs) best = record;
  }
  return best;
}

export function recentFor(
  records: GameRecord[],
  preset: BoardConfig,
  limit = 200,
): GameRecord[] {
  return records
    .filter((record) => samePreset(record.preset, preset))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function ranking(records: GameRecord[], preset: BoardConfig): GameRecord[] {
  return records
    .filter((record) => record.valid && samePreset(record.preset, preset))
    .sort((a, b) => a.durationMs - b.durationMs);
}

export function fmtDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
