import type { GenerateFailure, GenerateRequest } from "../core/generator.ts";
import { newGame, reduce } from "../core/rules.ts";
import type { BoardConfig, GameAction, GameState } from "../core/types.ts";
import { inlineSolver, type Solver } from "../worker/solverClient.ts";

export type Mode = "training" | "challenge";

export type ElapsedSource = () => number;

const REVIVE_FREEZE_MS = 700;

export class Store {
  private state: GameState;
  private listeners = new Set<() => void>();
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private frozen = false;
  private reviveCount = 0;
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
    this.state = newGame(config, seed);
  }

  getState(): GameState {
    return this.state;
  }

  getMode(): Mode {
    return this.mode;
  }

  getReviveCount(): number {
    return this.reviveCount;
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
    if (this.startedAt === null) return 0;
    return (this.endedAt ?? this.now()) - this.startedAt;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(action: GameAction): void {
    if (this.frozen || this.pending) return;
    if (action.type === "reveal" && this.state.status === "ready" && this.state.board === null) {
      this.requestGeneration(action.index);
      return;
    }
    this.apply(action);
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
        let next = reduce(this.state, {
          type: "start",
          board: result.board,
          firstIndex,
          seed: result.boardKey.seed,
        });
        this.startedAt = this.now();
        next = reduce(next, { type: "reveal", index: firstIndex });
        this.state = next;
      } else {
        this.error = result.reason;
      }
      this.emit();
    });
  }

  private apply(action: GameAction): void {
    if (action.type === "restart") {
      this.startedAt = null;
      this.endedAt = null;
      this.error = null;
    }
    const previous = this.state;
    const next = reduce(previous, action);
    if (previous.status === "ready" && next.status !== "ready" && this.startedAt === null) {
      this.startedAt = this.now();
    }
    if (next.status === "lost" && this.mode === "training" && action.type === "reveal") {
      this.revive(action.index);
      return;
    }
    if ((next.status === "won" || next.status === "lost") && this.endedAt === null) {
      this.endedAt = this.now();
    }
    this.state = next;
    this.emit();
  }

  private revive(index: number): void {
    this.reviveCount++;
    this.state = { ...this.state, reviewIndex: index };
    this.frozen = true;
    this.emit();
    this.freezeTimer = window.setTimeout(() => {
      this.frozen = false;
      this.freezeTimer = null;
      this.state = { ...this.state, reviewIndex: null };
      this.emit();
    }, REVIVE_FREEZE_MS);
  }

  dispose(): void {
    if (this.freezeTimer !== null) window.clearTimeout(this.freezeTimer);
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
