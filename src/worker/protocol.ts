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

export interface CancelMessage {
  id: number;
  type: "cancel";
  targetId: number;
}

export type SolverRequest = GenerateMessage | CancelMessage;

export type SolverResponse =
  | {
      id: number;
      ok: true;
      board: CompactBoard;
      boardKey: BoardKey;
      certificate: Certificate;
    }
  | { id: number; ok: false; reason: GenerateFailure };
