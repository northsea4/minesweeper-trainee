import { neighborsOf } from "./board.ts";
import { POLICY_VERSION, type Board, type BoardConfig } from "./types.ts";

export { POLICY_VERSION } from "./types.ts";

export type Technique =
  | "direct-safe"
  | "direct-mine"
  | "subset"
  | "overlap"
  | "global-count"
  | "model-contradiction";

export interface DeductionProof {
  technique: Technique;
  clueCells: number[];
  inputSets: Array<{ cells: number[]; mines: number }>;
  conclusion: { cells: number[]; kind: "safe" | "mine" };
  policyVersion: number;
}

export interface Deduction {
  action: "reveal" | "mark-mine";
  index: number;
  proof: DeductionProof;
}

export interface AnalyzeInput {
  width: number;
  height: number;
  mines: number;
  revealedNumbers: ReadonlyMap<number, number>;
  knownMines: ReadonlySet<number>;
}

export interface AnalyzeResult {
  status: "progress" | "needs-guess" | "contradiction";
  deductions: Deduction[];
  /** Hidden cells touched by at least one constraint — the frontier. */
  frontier: number[];
}

interface Constraint {
  clue: number;
  /** Unknown, not-yet-proven neighbours. */
  cells: number[];
  /** Mines remaining among `cells`. */
  remaining: number;
  /** All neighbours of the clue (revealed ones included). */
  allNeighbours: number[];
}

const TECHNIQUE_ORDER: Technique[] = [
  "direct-safe",
  "direct-mine",
  "subset",
  "overlap",
  "global-count",
  "model-contradiction",
];

export function isTechnique(value: string): value is Technique {
  return (TECHNIQUE_ORDER as string[]).includes(value);
}

export function analyze(input: AnalyzeInput): AnalyzeResult {
  const { width, height, mines, revealedNumbers, knownMines } = input;
  const config: BoardConfig = { width, height, mines };
  const total = width * height;

  const constraints: Constraint[] = [];
  const frontier = new Set<number>();
  const conclusions = new Map<number, { kind: "safe" | "mine"; proof: DeductionProof }>();
  let contradiction = false;

  for (const [clue, value] of revealedNumbers) {
    const allNeighbours = neighborsOf(clue, config);
    const known = allNeighbours.filter((n) => knownMines.has(n));
    const cells = allNeighbours.filter(
      (n) => !knownMines.has(n) && !revealedNumbers.has(n),
    );
    const remaining = value - known.length;
    if (remaining < 0 || remaining > cells.length) {
      contradiction = true;
      continue;
    }
    for (const cell of cells) frontier.add(cell);
    if (cells.length > 0) {
      constraints.push({ clue, cells, remaining, allNeighbours });
    }
  }

  const record = (cells: number[], kind: "safe" | "mine", proof: DeductionProof): void => {
    for (const cell of cells) {
      const existing = conclusions.get(cell);
      if (existing && existing.kind !== kind) {
        contradiction = true;
        continue;
      }
      if (!existing) conclusions.set(cell, { kind, proof });
    }
  };

  const directProof = (constraint: Constraint, kind: "safe" | "mine"): DeductionProof => ({
    technique: kind === "safe" ? "direct-safe" : "direct-mine",
    clueCells: [constraint.clue],
    inputSets: [{ cells: [...constraint.allNeighbours], mines: revealedNumbers.get(constraint.clue)! }],
    conclusion: { cells: [...constraint.cells], kind },
    policyVersion: POLICY_VERSION,
  });

  for (const constraint of constraints) {
    if (constraint.remaining === 0) record(constraint.cells, "safe", directProof(constraint, "safe"));
    else if (constraint.remaining === constraint.cells.length)
      record(constraint.cells, "mine", directProof(constraint, "mine"));
  }

  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      combineConstraints(constraints[i], constraints[j], record);
    }
  }

  const unknown: number[] = [];
  for (let index = 0; index < total; index++) {
    if (!revealedNumbers.has(index) && !knownMines.has(index)) unknown.push(index);
  }
  const remainingGlobal = mines - knownMines.size;
  if (remainingGlobal < 0) contradiction = true;
  if (remainingGlobal === 0 && unknown.length > 0) {
    record(unknown, "safe", globalProof(unknown, remainingGlobal, "safe"));
  } else if (remainingGlobal === unknown.length && unknown.length > 0) {
    record(unknown, "mine", globalProof(unknown, remainingGlobal, "mine"));
  }

  const deductions: Deduction[] = [];
  for (const [index, { kind, proof }] of conclusions) {
    deductions.push({ action: kind === "safe" ? "reveal" : "mark-mine", index, proof });
  }
  deductions.sort((a, b) => {
    if (a.action !== b.action) return a.action === "reveal" ? -1 : 1;
    return techniqueRank(a.proof.technique) - techniqueRank(b.proof.technique);
  });

  const status: AnalyzeResult["status"] = contradiction
    ? "contradiction"
    : deductions.length > 0
      ? "progress"
      : "needs-guess";
  return { status, deductions, frontier: [...frontier] };
}

function combineConstraints(
  a: Constraint,
  b: Constraint,
  record: (cells: number[], kind: "safe" | "mine", proof: DeductionProof) => void,
): void {
  const setA = new Set(a.cells);
  const setB = new Set(b.cells);
  const aSubsetB = a.cells.every((cell) => setB.has(cell));
  const bSubsetA = b.cells.every((cell) => setA.has(cell));

  if (aSubsetB) {
    const diff = b.cells.filter((cell) => !setA.has(cell));
    subsetConclusion(a, b, diff, record);
    return;
  }
  if (bSubsetA) {
    const diff = a.cells.filter((cell) => !setB.has(cell));
    subsetConclusion(b, a, diff, record);
    return;
  }

  const onlyA = a.cells.filter((cell) => !setB.has(cell));
  const onlyB = b.cells.filter((cell) => !setA.has(cell));
  const both = a.cells.filter((cell) => setB.has(cell));
  if (both.length === 0) return;

  const low = Math.max(0, a.remaining - onlyA.length, b.remaining - onlyB.length);
  const high = Math.min(a.remaining, b.remaining, both.length);
  if (low !== high) return;

  const overlap = low;
  const proofBase = (): DeductionProof => ({
    technique: "overlap",
    clueCells: [a.clue, b.clue],
    inputSets: [
      { cells: [...a.cells], mines: a.remaining },
      { cells: [...b.cells], mines: b.remaining },
    ],
    conclusion: { cells: [], kind: "safe" },
    policyVersion: POLICY_VERSION,
  });

  if (both.length > 0) {
    if (overlap === 0) record(both, "safe", withConclusion(proofBase(), both, "safe"));
    else if (overlap === both.length) record(both, "mine", withConclusion(proofBase(), both, "mine"));
  }
  const aMines = a.remaining - overlap;
  if (onlyA.length > 0) {
    if (aMines === 0) record(onlyA, "safe", withConclusion(proofBase(), onlyA, "safe"));
    else if (aMines === onlyA.length) record(onlyA, "mine", withConclusion(proofBase(), onlyA, "mine"));
  }
  const bMines = b.remaining - overlap;
  if (onlyB.length > 0) {
    if (bMines === 0) record(onlyB, "safe", withConclusion(proofBase(), onlyB, "safe"));
    else if (bMines === onlyB.length) record(onlyB, "mine", withConclusion(proofBase(), onlyB, "mine"));
  }
}

function subsetConclusion(
  small: Constraint,
  big: Constraint,
  diff: number[],
  record: (cells: number[], kind: "safe" | "mine", proof: DeductionProof) => void,
): void {
  if (diff.length === 0) return;
  const diffMines = big.remaining - small.remaining;
  if (diffMines < 0 || diffMines > diff.length) return;
  const proof: DeductionProof = {
    technique: "subset",
    clueCells: [small.clue, big.clue],
    inputSets: [
      { cells: [...small.cells], mines: small.remaining },
      { cells: [...big.cells], mines: big.remaining },
    ],
    conclusion: { cells: [...diff], kind: "safe" },
    policyVersion: POLICY_VERSION,
  };
  if (diffMines === 0) record(diff, "safe", { ...proof, conclusion: { cells: [...diff], kind: "safe" } });
  else if (diffMines === diff.length)
    record(diff, "mine", { ...proof, conclusion: { cells: [...diff], kind: "mine" } });
}

function globalProof(cells: number[], mines: number, kind: "safe" | "mine"): DeductionProof {
  return {
    technique: "global-count",
    clueCells: [],
    inputSets: [{ cells: [...cells], mines }],
    conclusion: { cells: [...cells], kind },
    policyVersion: POLICY_VERSION,
  };
}

function withConclusion(
  proof: DeductionProof,
  cells: number[],
  kind: "safe" | "mine",
): DeductionProof {
  return { ...proof, conclusion: { cells: [...cells], kind } };
}

function techniqueRank(technique: Technique): number {
  return TECHNIQUE_ORDER.indexOf(technique);
}

/** Looks at the true board only to report the clue value at a revealed cell. */
export function clueAt(board: Board, index: number): number {
  return board.cells[index].adjacent;
}
