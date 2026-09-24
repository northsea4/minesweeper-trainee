/// <reference lib="webworker" />
import { toCompact } from "../core/board.ts";
import { generateNoGuess } from "../core/generator.ts";
import type { GenerateMessage, SolverRequest, SolverResponse } from "./protocol.ts";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<SolverRequest>) => {
  const request = event.data;
  if (request.type !== "generate") return;
  const message = request as GenerateMessage;
  const result = generateNoGuess({
    config: message.config,
    seed: message.seed,
    firstIndex: message.firstIndex,
    budget: message.budget,
  });
  if (result.ok) {
    const board = toCompact(result.board);
    const response: SolverResponse = {
      id: message.id,
      ok: true,
      board,
      boardKey: result.boardKey,
      certificate: result.certificate,
    };
    scope.postMessage(response, [board.mine.buffer, board.adjacent.buffer]);
  } else {
    const response: SolverResponse = { id: message.id, ok: false, reason: result.reason };
    scope.postMessage(response);
  }
};
