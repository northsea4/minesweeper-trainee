import { newGame, reduce } from "../core/rules.ts";
import type { BoardConfig, GameAction, GameState } from "../core/types.ts";

export type ElapsedSource = () => number;

export class Store {
  private state: GameState;
  private listeners = new Set<() => void>();
  private startedAt: number | null = null;
  private endedAt: number | null = null;

  constructor(
    config: BoardConfig,
    seed: number,
    private now: ElapsedSource = () => Date.now(),
  ) {
    this.state = newGame(config, seed);
  }

  getState(): GameState {
    return this.state;
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
    if (action.type === "restart") {
      this.startedAt = null;
      this.endedAt = null;
    }
    const previous = this.state;
    const next = reduce(previous, action);
    if (
      previous.status === "ready" &&
      next.status !== "ready" &&
      this.startedAt === null
    ) {
      this.startedAt = this.now();
    }
    if ((next.status === "won" || next.status === "lost") && this.endedAt === null) {
      this.endedAt = this.now();
    }
    this.state = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
