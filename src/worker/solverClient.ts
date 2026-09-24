import { fromCompact } from "../core/board.ts";
import type { GenerateRequest, GenerateResult } from "../core/generator.ts";
import { generateNoGuess } from "../core/generator.ts";
import type { SolverRequest, SolverResponse } from "./protocol.ts";

export interface Solver {
  generate(request: GenerateRequest): Promise<GenerateResult>;
  cancel(): void;
  dispose(): void;
}

interface Pending {
  resolve: (result: GenerateResult) => void;
}

export class WorkerSolver implements Solver {
  private worker: Worker | null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    const worker = createWorker();
    this.worker = worker;
    if (worker) this.attach(worker);
  }

  generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.worker) return Promise.resolve(generateNoGuess(request));
    const id = this.nextId++;
    return new Promise<GenerateResult>((resolve) => {
      this.pending.set(id, { resolve });
      const message: SolverRequest = {
        id,
        type: "generate",
        config: request.config,
        seed: request.seed,
        firstIndex: request.firstIndex,
        budget: request.budget,
      };
      this.worker!.postMessage(message);
    });
  }

  cancel(): void {
    const worker = this.worker;
    if (!worker) return;
    worker.terminate();
    this.settlePending("cancelled");
    const next = createWorker();
    this.worker = next;
    if (next) this.attach(next);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.settlePending("cancelled");
  }

  private settlePending(reason: "cancelled"): void {
    for (const [, entry] of this.pending) entry.resolve({ ok: false, reason });
    this.pending.clear();
  }

  private attach(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<SolverResponse>) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) {
        entry.resolve({
          ok: true,
          board: fromCompact(response.board),
          boardKey: response.boardKey,
          certificate: response.certificate,
        });
      } else {
        entry.resolve({ ok: false, reason: response.reason });
      }
    };
    worker.onerror = () => {
      for (const [, entry] of this.pending) {
        entry.resolve({ ok: false, reason: "internal-verification-error" });
      }
      this.pending.clear();
    };
  }
}

function createWorker(): Worker | null {
  try {
    if (typeof Worker === "undefined") return null;
    return new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/** Runs generation synchronously — used where workers are unavailable (tests, SSR). */
export const inlineSolver: Solver = {
  generate: (request) => Promise.resolve(generateNoGuess(request)),
  cancel: () => void 0,
  dispose: () => void 0,
};
