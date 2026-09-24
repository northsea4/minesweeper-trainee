import { emptyBoard, neighborsOf } from "./board.ts";
import { certifyBoard, type Certificate } from "./certificate.ts";
import { makeRng, PRNG_VERSION } from "./rng.ts";
import type { Board, BoardConfig, BoardKey } from "./types.ts";
import { ALGORITHM_VERSION, POLICY_VERSION } from "./types.ts";

export function minePositions(
  config: BoardConfig,
  seed: number,
  firstIndex: number,
): number[] {
  const { width, height, mines } = config;
  const total = width * height;
  const forbidden = new Set([firstIndex, ...neighborsOf(firstIndex, config)]);
  const allowed: number[] = [];
  for (let index = 0; index < total; index++) {
    if (!forbidden.has(index)) allowed.push(index);
  }
  const rng = makeRng(seed);
  const count = Math.min(mines, allowed.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (allowed.length - i));
    const tmp = allowed[i];
    allowed[i] = allowed[j];
    allowed[j] = tmp;
  }
  return allowed.slice(0, count);
}

export function generateBoard(config: BoardConfig, seed: number, firstIndex: number): Board {
  const board = emptyBoard(config);
  for (const index of minePositions(config, seed, firstIndex)) {
    board.cells[index].mine = true;
  }
  recomputeAdjacency(board);
  return board;
}

export function recomputeAdjacency(board: Board): void {
  const config: BoardConfig = {
    width: board.width,
    height: board.height,
    mines: board.mines,
  };
  for (let index = 0; index < board.cells.length; index++) {
    if (board.cells[index].mine) {
      board.cells[index].adjacent = 0;
      continue;
    }
    board.cells[index].adjacent = neighborsOf(index, config).filter(
      (n) => board.cells[n].mine,
    ).length;
  }
}

export interface GenerateBudget {
  maxCandidates: number;
  maxRepairsPerCandidate: number;
  deadlineMs: number;
  maxSteps: number;
}

export const DEFAULT_BUDGET: GenerateBudget = {
  maxCandidates: 200,
  maxRepairsPerCandidate: 20,
  deadlineMs: 2000,
  maxSteps: 5000,
};

export type GenerateFailure =
  | "invalid-preset"
  | "budget-exhausted"
  | "cancelled"
  | "internal-verification-error";

export interface GenerateRequest {
  config: BoardConfig;
  seed: number;
  firstIndex: number;
  budget?: Partial<GenerateBudget>;
}

export type GenerateResult =
  | { ok: true; board: Board; boardKey: BoardKey; certificate: Certificate }
  | { ok: false; reason: GenerateFailure };

export interface GenerateHooks {
  isCancelled?: () => boolean;
  onProgress?: (info: { candidates: number; repairs: number }) => void;
}

export function validatePreset(config: BoardConfig): boolean {
  const { width, height, mines } = config;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(mines)) {
    return false;
  }
  if (width < 3 || height < 3) return false;
  if (mines < 1 || mines > width * height - 9) return false;
  return true;
}

export function generateNoGuess(
  request: GenerateRequest,
  hooks: GenerateHooks = {},
): GenerateResult {
  const { config, seed, firstIndex } = request;
  if (!validatePreset(config)) return { ok: false, reason: "invalid-preset" };
  if (firstIndex < 0 || firstIndex >= config.width * config.height) {
    return { ok: false, reason: "invalid-preset" };
  }

  const budget: GenerateBudget = { ...DEFAULT_BUDGET, ...request.budget };
  const deadline = Date.now() + budget.deadlineMs;
  const rng = makeRng(seed);
  const protectedSet = new Set([firstIndex, ...neighborsOf(firstIndex, config)]);
  let repairs = 0;

  for (let candidate = 0; candidate < budget.maxCandidates; candidate++) {
    if (hooks.isCancelled?.()) return { ok: false, reason: "cancelled" };
    if (Date.now() > deadline) return { ok: false, reason: "budget-exhausted" };

    const boardSeed = Math.floor(rng() * 0x100000000) >>> 0;
    let board = generateBoard(config, boardSeed, firstIndex);

    for (let attempt = 0; ; attempt++) {
      hooks.onProgress?.({ candidates: candidate, repairs });
      const result = certifyBoard(board, firstIndex, budget.maxSteps);
      if (result.ok) {
        return {
          ok: true,
          board,
          boardKey: {
            algorithmVersion: ALGORITHM_VERSION,
            policyVersion: POLICY_VERSION,
            prngVersion: PRNG_VERSION,
            seed: boardSeed,
            width: config.width,
            height: config.height,
            mines: config.mines,
            firstIndex,
          },
          certificate: result.certificate,
        };
      }
      if (result.reason === "internal-verification-error") {
        return { ok: false, reason: "internal-verification-error" };
      }
      if (attempt >= budget.maxRepairsPerCandidate) break;
      if (Date.now() > deadline) return { ok: false, reason: "budget-exhausted" };
      const repaired = perturb(board, protectedSet, result.frontier, rng);
      if (!repaired) break;
      board = repaired;
      repairs++;
    }
  }

  return { ok: false, reason: "budget-exhausted" };
}

function perturb(
  board: Board,
  protectedSet: Set<number>,
  frontier: number[],
  rng: () => number,
): Board | null {
  if (frontier.length === 0) return null;
  const targets = frontier.filter((index) => !protectedSet.has(index) && !board.cells[index].mine);
  if (targets.length === 0) return null;
  const donors: number[] = [];
  for (let index = 0; index < board.cells.length; index++) {
    if (board.cells[index].mine && !protectedSet.has(index)) donors.push(index);
  }
  if (donors.length === 0) return null;

  const target = targets[Math.floor(rng() * targets.length)];
  const donor = donors[Math.floor(rng() * donors.length)];
  if (target === donor) return null;

  const next = cloneBoard(board);
  next.cells[donor].mine = false;
  next.cells[target].mine = true;
  recomputeAdjacency(next);
  return next;
}

function cloneBoard(board: Board): Board {
  return {
    width: board.width,
    height: board.height,
    mines: board.mines,
    cells: board.cells.map((cell) => ({ mine: cell.mine, adjacent: cell.adjacent })),
  };
}
