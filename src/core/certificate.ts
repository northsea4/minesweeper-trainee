import { analyze, type DeductionProof } from "./analyze.ts";
import { floodReveal } from "./reveal.ts";
import { POLICY_VERSION, type Board } from "./types.ts";

export interface CertificateStep {
  action: "reveal" | "mark-mine";
  index: number;
  proof: DeductionProof;
}

export interface Certificate {
  policyVersion: number;
  firstIndex: number;
  steps: CertificateStep[];
  revealedCount: number;
}

export type CertifyFailure = "needs-guess" | "internal-verification-error" | "step-limit";

export type CertifyResult =
  | { ok: true; certificate: Certificate }
  | { ok: false; reason: CertifyFailure; frontier: number[] };

class PublicState {
  revealedNumbers = new Map<number, number>();
  knownMines = new Set<number>();
  revealedCount = 0;

  constructor(private board: Board) {}

  revealArea(start: number): number {
    const freshly = floodReveal(
      this.board,
      start,
      (index) => this.revealedNumbers.has(index) || this.knownMines.has(index),
    );
    for (const index of freshly) {
      this.revealedNumbers.set(index, this.board.cells[index].adjacent);
    }
    this.revealedCount += freshly.length;
    return freshly.length;
  }
}

export function certifyBoard(
  board: Board,
  firstIndex: number,
  maxSteps = 5000,
  deadline?: number,
): CertifyResult {
  const state = new PublicState(board);
  state.revealArea(firstIndex);
  const steps: CertificateStep[] = [];

  while (state.revealedCount < board.cells.length - board.mines) {
    if (steps.length >= maxSteps) {
      return { ok: false, reason: "step-limit", frontier: [] };
    }
    if (deadline !== undefined && Date.now() > deadline) {
      return { ok: false, reason: "step-limit", frontier: [] };
    }
    const result = analyze({
      width: board.width,
      height: board.height,
      mines: board.mines,
      revealedNumbers: state.revealedNumbers,
      knownMines: state.knownMines,
    });
    if (result.status === "contradiction") {
      return { ok: false, reason: "internal-verification-error", frontier: result.frontier };
    }
    if (result.status !== "progress" || result.deductions.length === 0) {
      return { ok: false, reason: "needs-guess", frontier: result.frontier };
    }
    const deduction =
      result.deductions.find((d) => d.action === "reveal") ?? result.deductions[0];
    if (deduction.action === "reveal") {
      if (board.cells[deduction.index].mine) {
        return { ok: false, reason: "internal-verification-error", frontier: result.frontier };
      }
      state.revealArea(deduction.index);
    } else {
      if (!board.cells[deduction.index].mine) {
        return { ok: false, reason: "internal-verification-error", frontier: result.frontier };
      }
      state.knownMines.add(deduction.index);
    }
    steps.push({ action: deduction.action, index: deduction.index, proof: deduction.proof });
  }

  return {
    ok: true,
    certificate: {
      policyVersion: POLICY_VERSION,
      firstIndex,
      steps,
      revealedCount: state.revealedCount,
    },
  };
}

export type ReplayResult =
  | { ok: true; revealedCount: number }
  | { ok: false; step: number; reason: string };

export function replayCertificate(board: Board, certificate: Certificate): ReplayResult {
  const state = new PublicState(board);
  state.revealArea(certificate.firstIndex);

  for (let step = 0; step < certificate.steps.length; step++) {
    const action = certificate.steps[step];
    const result = analyze({
      width: board.width,
      height: board.height,
      mines: board.mines,
      revealedNumbers: state.revealedNumbers,
      knownMines: state.knownMines,
    });
    const matching = result.deductions.find(
      (deduction) => deduction.index === action.index && deduction.action === action.action,
    );
    if (!matching) {
      return { ok: false, step, reason: "proof premises do not hold" };
    }
    if (action.action === "reveal") {
      if (board.cells[action.index].mine) {
        return { ok: false, step, reason: "revealed a mine" };
      }
      state.revealArea(action.index);
    } else {
      state.knownMines.add(action.index);
    }
  }

  if (state.revealedCount !== board.cells.length - board.mines) {
    return { ok: false, step: certificate.steps.length, reason: "did not reach a win" };
  }
  return { ok: true, revealedCount: state.revealedCount };
}
