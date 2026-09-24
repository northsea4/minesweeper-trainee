import { neighborsOf } from "./board.ts";
import { POLICY_VERSION, type BoardConfig } from "./types.ts";

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

  if (!contradiction && conclusions.size === 0 && constraints.length > 0) {
    for (const forced of enumerateFrontier(constraints)) {
      record(forced.cells, forced.kind, forced.proof);
    }
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

const MAX_ENUM_CELLS = 22;
const ENUM_NODE_BUDGET = 5_000_000;

interface ComponentResult {
  counts: Int32Array;
  models: number;
  nodes: number;
  contradiction: boolean;
}

function modelProof(
  clueCells: number[],
  inputSets: Array<{ cells: number[]; mines: number }>,
  cells: number[],
  kind: "safe" | "mine",
): DeductionProof {
  return {
    technique: "model-contradiction",
    clueCells,
    inputSets,
    conclusion: { cells: [...cells], kind },
    policyVersion: POLICY_VERSION,
  };
}

/** Bounded exact enumeration of the frontier components when the local rules stall. */
function enumerateFrontier(
  constraints: Constraint[],
): Array<{ cells: number[]; kind: "safe" | "mine"; proof: DeductionProof }> {
  const byCell = new Map<number, number[]>();
  constraints.forEach((constraint, index) => {
    for (const cell of constraint.cells) {
      const list = byCell.get(cell);
      if (list) list.push(index);
      else byCell.set(cell, [index]);
    }
  });

  const seen = new Set<number>();
  const results: Array<{ cells: number[]; kind: "safe" | "mine"; proof: DeductionProof }> = [];
  let budget = ENUM_NODE_BUDGET;

  for (let start = 0; start < constraints.length; start++) {
    if (seen.has(start)) continue;
    const members = new Set<number>();
    const cellSet = new Set<number>();
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      members.add(index);
      for (const cell of constraints[index].cells) {
        cellSet.add(cell);
        for (const neighbour of byCell.get(cell)!) {
          if (!seen.has(neighbour)) {
            seen.add(neighbour);
            stack.push(neighbour);
          }
        }
      }
    }
    const cells = [...cellSet];
    if (cells.length > MAX_ENUM_CELLS) continue;

    const component = enumerateComponent(cells, constraints, members, budget);
    if (component === null) continue;
    budget -= component.nodes;
    if (component.models === 0) continue;

    const clueCells = [...members].map((index) => constraints[index].clue);
    const inputSets = [...members].map((index) => ({
      cells: [...constraints[index].cells],
      mines: constraints[index].remaining,
    }));
    const safe: number[] = [];
    const mine: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (component.counts[i] === 0) safe.push(cells[i]);
      else if (component.counts[i] === component.models) mine.push(cells[i]);
    }
    if (safe.length > 0) {
      results.push({ cells: safe, kind: "safe", proof: modelProof(clueCells, inputSets, safe, "safe") });
    }
    if (mine.length > 0) {
      results.push({ cells: mine, kind: "mine", proof: modelProof(clueCells, inputSets, mine, "mine") });
    }
    if (budget <= 0) break;
  }
  return results;
}

function enumerateComponent(
  cells: number[],
  constraints: Constraint[],
  members: Set<number>,
  nodeBudget: number,
): ComponentResult | null {
  if (nodeBudget <= 0) return null;
  const indexOf = new Map<number, number>();
  cells.forEach((cell, index) => indexOf.set(cell, index));
  const active = constraints.map((constraint, index) => ({ constraint, index })).filter(
    (entry) => members.has(entry.index),
  );
  const touching: Array<Array<{ mines: number; sum: number; count: number; cells: number[] }>> =
    cells.map(() => []);
  const sets = active.map(({ constraint }) => {
    const set = {
      mines: constraint.remaining,
      sum: 0,
      count: 0,
      cells: constraint.cells.map((cell) => indexOf.get(cell)!),
    };
    return set;
  });
  for (const set of sets) {
    for (const cellIndex of set.cells) {
      touching[cellIndex].push(set);
    }
  }

  const counts = new Int32Array(cells.length);
  const assigned = new Int8Array(cells.length).fill(-1);
  let models = 0;
  let nodes = 0;
  let aborted = false;

  const dfs = (i: number): void => {
    if (aborted) return;
    nodes++;
    if (nodes > nodeBudget) {
      aborted = true;
      return;
    }
    if (i === cells.length) {
      models++;
      for (let k = 0; k < cells.length; k++) if (assigned[k] === 1) counts[k]++;
      return;
    }
    for (const value of [0, 1]) {
      let ok = true;
      for (const set of touching[i]) {
        if (value === 1) set.sum++;
        set.count++;
        if (set.sum > set.mines || set.sum + (set.cells.length - set.count) < set.mines) {
          ok = false;
        }
      }
      if (ok) {
        assigned[i] = value;
        dfs(i + 1);
        assigned[i] = -1;
      }
      for (const set of touching[i]) {
        if (value === 1) set.sum--;
        set.count--;
      }
      if (aborted) return;
    }
  };
  dfs(0);
  if (aborted) return null;
  return { counts, models, nodes, contradiction: models === 0 };
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
