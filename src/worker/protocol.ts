import type { CompactBoard } from "../core/board.ts";
import type { Certificate } from "../core/certificate.ts";
import type { GenerateBudget, GenerateFailure } from "../core/generator.ts";
import type { BoardConfig, BoardKey } from "../core/types.ts";

export interface GenerateMessage {
  id: number;
  type: "generate";
  config: BoardConfig;
  seed: number;
  firstIndex: number;
  budget?: Partial<GenerateBudget>;
}

export type SolverRequest = GenerateMessage;

export type SolverResponse =
  | {
      id: number;
      ok: true;
      board: CompactBoard;
      boardKey: BoardKey;
      certificate: Certificate;
    }
  | { id: number; ok: false; reason: GenerateFailure };
