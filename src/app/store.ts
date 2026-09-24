import type { Deduction } from "../core/analyze.ts";
import { nextAid } from "../core/aid.ts";
import type { GenerateFailure, GenerateRequest } from "../core/generator.ts";
import { isPlayable, isTimerRunning, newGame, reduce } from "../core/rules.ts";
import type { BoardConfig, GameAction, GameMode, GameState } from "../core/types.ts";
import { inlineSolver, type Solver } from "../worker/solverClient.ts";

export type Mode = GameMode;

export type ElapsedSource = () => number;

const REVIVE_FREEZE_MS = 700;
const LEADER_INTERVAL_MS = 450;

export type AidKind = "hint" | "smart" | "leader";

export interface AidState {
  kind: AidKind;
  step: Deduction | null;
  conflict: boolean;
}

export class Store {
  private state: GameState;
  private listeners = new Set<() => void>();
  private accumulated = 0;
  private runningSince: number | null = null;
  private frozen = false;
  private freezeTimer: number | null = null;
  private pending = false;
  private error: GenerateFailure | null = null;
  private aid: AidState | null = null;
  private leaderTimer: number | null = null;
  private aidUsage = { hint: 0, smart: 0, leader: 0 };

  constructor(
    config: BoardConfig,
    seed: number,
    private mode: Mode = "training",
    private solver: Solver = inlineSolver,
    private now: ElapsedSource = () => Date.now(),
  ) {
    this.state = newGame(config, seed, mode);
  }

  getState(): GameState {
    return this.state;
  }

  getMode(): Mode {
    return this.mode;
  }

  getReviveCount(): number {
    return this.state.revives;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  isPending(): boolean {
    return this.pending;
  }

  getError(): GenerateFailure | null {
    return this.error;
  }

  getAid(): AidState | null {
    return this.aid;
  }

  getAidUsage(): { hint: number; smart: number; leader: number; revives: number } {
    return { ...this.aidUsage, revives: this.state.revives };
  }

  requestHint(): void {
    this.aidUsage.hint++;
    this.computeAid("hint");
  }

  requestSmartHint(): void {
    this.aidUsage.smart++;
    this.computeAid("smart");
  }

  startLeader(): void {
    this.stopLeader();
    if (!this.state.board || !isPlayable(this.state)) return;
    this.aidUsage.leader++;
    this.leaderTick();
  }

  stopLeader(): void {
    if (this.leaderTimer !== null) {
      window.clearTimeout(this.leaderTimer);
      this.leaderTimer = null;
    }
    if (this.aid?.kind === "leader") {
      this.aid = null;
      this.emit();
    }
  }

  clearAid(): void {
    if (this.aid !== null) {
      this.aid = null;
      this.emit();
    }
  }

  private aidInputs(): {
    revealedNumbers: Map<number, number>;
    playerFlags: Set<number>;
  } | null {
    const state = this.state;
    if (!state.board) return null;
    const revealedNumbers = new Map<number, number>();
    const playerFlags = new Set<number>();
    for (let index = 0; index < state.marks.length; index++) {
      if (state.marks[index] === "revealed") {
        revealedNumbers.set(index, state.board.cells[index].adjacent);
      } else if (state.marks[index] === "flagged") {
        playerFlags.add(index);
      }
    }
    return { revealedNumbers, playerFlags };
  }

  private computeAid(kind: AidKind): void {
    if (!isPlayable(this.state)) return;
    const inputs = this.aidInputs();
    if (!inputs) return;
    const result = nextAid(this.state.board!, inputs.revealedNumbers, inputs.playerFlags);
    this.aid = { kind, step: result.step, conflict: result.conflict };
    this.emit();
  }

  private leaderTick(): void {
    this.leaderTimer = null;
    if (!isPlayable(this.state)) {
      this.aid = null;
      this.emit();
      return;
    }
    const inputs = this.aidInputs();
    if (!inputs) return;
    const result = nextAid(this.state.board!, inputs.revealedNumbers, inputs.playerFlags);
    this.aid = { kind: "leader", step: result.step, conflict: result.conflict };
    this.emit();
    if (!result.step) return;
    const step = result.step;
    if (step.action === "reveal") this.commit({ type: "reveal", index: step.index });
    else this.commit({ type: "toggleFlag", index: step.index });
    if (isPlayable(this.state)) {
      this.leaderTimer = window.setTimeout(() => this.leaderTick(), LEADER_INTERVAL_MS);
    }
  }

  getElapsedMs(): number {
    if (this.runningSince !== null) return this.accumulated + (this.now() - this.runningSince);
    return this.accumulated;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(action: GameAction): void {
    if (this.frozen || this.pending) return;
    if (this.aid?.kind === "leader") this.stopLeader();
    else if (this.aid !== null) {
      this.aid = null;
    }
    if (action.type === "restart") {
      this.accumulated = 0;
      this.runningSince = null;
      this.error = null;
      this.stopLeader();
    }
    if (action.type === "reveal" && this.state.status === "ready" && this.state.board === null) {
      this.requestGeneration(action.index);
      return;
    }
    this.commit(action);
  }

  private requestGeneration(firstIndex: number): void {
    this.pending = true;
    this.error = null;
    this.emit();
    const request: GenerateRequest = {
      config: this.state.config,
      seed: this.state.seed,
      firstIndex,
    };
    this.solver.generate(request).then((result) => {
      this.pending = false;
      if (result.ok) {
        const started = reduce(this.state, {
          type: "start",
          board: result.board,
          firstIndex,
          seed: result.boardKey.seed,
        });
        this.syncTimer(this.state, started);
        this.commit({ type: "reveal", index: firstIndex }, started);
      } else {
        this.error = result.reason;
        this.emit();
      }
    });
  }

  private commit(action: GameAction, from?: GameState): void {
    const previous = from ?? this.state;
    const next = reduce(previous, action);
    if (next === previous) return;
    this.syncTimer(previous, next);
    this.state = next;
    if (next.revives > previous.revives) {
      this.beginFreeze();
      return;
    }
    if (!isPlayable(next) && this.leaderTimer !== null) this.stopLeader();
    this.emit();
  }

  private beginFreeze(): void {
    this.frozen = true;
    this.emit();
    this.freezeTimer = window.setTimeout(() => {
      this.frozen = false;
      this.freezeTimer = null;
      this.state = reduce(this.state, { type: "clearReview" });
      this.emit();
    }, REVIVE_FREEZE_MS);
  }

  private syncTimer(previous: GameState, next: GameState): void {
    const wasRunning = isTimerRunning(previous);
    const running = isTimerRunning(next);
    if (!wasRunning && running) {
      this.runningSince = this.now();
    } else if (wasRunning && !running && this.runningSince !== null) {
      this.accumulated += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  dispose(): void {
    if (this.freezeTimer !== null) window.clearTimeout(this.freezeTimer);
    if (this.leaderTimer !== null) window.clearTimeout(this.leaderTimer);
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
