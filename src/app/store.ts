import type { GenerateFailure, GenerateRequest } from "../core/generator.ts";
import { isTimerRunning, newGame, reduce } from "../core/rules.ts";
import type { BoardConfig, GameAction, GameMode, GameState } from "../core/types.ts";
import { inlineSolver, type Solver } from "../worker/solverClient.ts";

export type Mode = GameMode;

export type ElapsedSource = () => number;

const REVIVE_FREEZE_MS = 700;

export class Store {
  private state: GameState;
  private listeners = new Set<() => void>();
  private accumulated = 0;
  private runningSince: number | null = null;
  private frozen = false;
  private freezeTimer: number | null = null;
  private pending = false;
  private error: GenerateFailure | null = null;

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
    if (action.type === "restart") {
      this.accumulated = 0;
      this.runningSince = null;
      this.error = null;
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
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
