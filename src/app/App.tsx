import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GenerateFailure } from "../core/generator.ts";
import { DEFAULT_PRESET, PRESETS } from "../core/presets.ts";
import { boardKey, remainingMines } from "../core/rules.ts";
import type { BoardConfig, BoardKey, GameAction, GameState } from "../core/types.ts";
import { BoardView } from "../ui/boardView.ts";
import { settings, type RevealMode } from "./settings.ts";
import { type Mode, Store } from "./store.ts";
import { WorkerSolver } from "../worker/solverClient.ts";

export interface DebugApi {
  getState(): GameState;
  dispatch(action: GameAction): void;
  snapshot(): {
    state: GameState;
    boardKey: BoardKey | null;
    elapsedMs: number;
    mode: Mode;
    reviveCount: number;
    frozen: boolean;
    pending: boolean;
    error: GenerateFailure | null;
  };
}

declare global {
  interface Window {
    __ms?: DebugApi;
  }
}

const PRESET_OPTIONS = PRESETS;
const PRESETS_MAP: Record<string, BoardConfig> = Object.fromEntries(
  PRESETS.map((p) => [p.id, { width: p.width, height: p.height, mines: p.mines }]),
);

function presetIdOf(config: BoardConfig): string {
  const found = PRESETS.find(
    (p) => p.width === config.width && p.height === config.height && p.mines === config.mines,
  );
  return found?.id ?? DEFAULT_PRESET.id;
}

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const ERROR_TEXT: Record<GenerateFailure, string> = {
  "invalid-preset": "预设不合法，请调整后重试。",
  "budget-exhausted": "这个预设暂时无法生成无猜棋盘，请重试。",
  cancelled: "生成已取消。",
  "internal-verification-error": "生成校验失败，请重试。",
};

function statusText(state: GameState, pending: boolean): string {
  if (pending) return "生成中…";
  switch (state.status) {
    case "ready":
      return "点第一格开始";
    case "playing":
      return "进行中";
    case "won":
      return "胜利！";
    case "lost":
      return "触雷了";
  }
}

const REVEAL_MODE_LABELS: Record<RevealMode, string> = {
  release: "松手确认",
  press: "按下即生效",
};

export function App({
  config,
  seed,
  mode = "training",
  onNewConfig,
}: {
  config: BoardConfig;
  seed?: number;
  mode?: Mode;
  onNewConfig: (config: BoardConfig) => void;
}) {
  const solver = useRef(new WorkerSolver()).current;
  const [store, setStore] = useState(() => new Store(config, seed ?? randomSeed(), mode, solver));
  const boardHost = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  useEffect(() => () => solver.dispose(), [solver]);

  const view = useMemo(
    () =>
      new BoardView(
        {
          onReveal: (index) => store.dispatch({ type: "reveal", index }),
          onFlag: (index) => store.dispatch({ type: "toggleFlag", index }),
          onChord: (index) => store.dispatch({ type: "chord", index }),
        },
        {
          getRevealMode: () => settings.get().revealMode,
          isLocked: () =>
            store.isFrozen() ||
            store.isPending() ||
            store.getState().status === "won" ||
            store.getState().status === "lost",
        },
      ),
    [store],
  );

  useEffect(() => {
    if (boardHost.current) view.mount(boardHost.current);
    view.render(store.getState());
    const unsubscribe = store.subscribe(() => {
      view.render(store.getState());
      forceRender((n) => n + 1);
    });
    const unsubscribeSettings = settings.subscribe(() => forceRender((n) => n + 1));
    const timer = window.setInterval(() => {
      if (store.getState().status === "playing") forceRender((n) => n + 1);
    }, 250);
    window.__ms = {
      getState: () => store.getState(),
      dispatch: (action) => store.dispatch(action),
      snapshot: () => ({
        state: store.getState(),
        boardKey: boardKey(store.getState()),
        elapsedMs: store.getElapsedMs(),
        mode: store.getMode(),
        reviveCount: store.getReviveCount(),
        frozen: store.isFrozen(),
        pending: store.isPending(),
        error: store.getError(),
      }),
    };
    return () => {
      unsubscribe();
      unsubscribeSettings();
      window.clearInterval(timer);
      store.dispose();
      view.destroy();
    };
  }, [store, view]);

  const state = store.getState();
  const revealMode = settings.get().revealMode;
  const pending = store.isPending();
  const error = store.getError();

  const startNew = (nextConfig: BoardConfig) =>
    setStore(new Store(nextConfig, randomSeed(), mode, solver));

  return (
    <main class="app">
      <header class="statusbar">
        <div class="statusbar__item" data-testid="remaining">
          <span class="statusbar__label">剩余雷数</span>
          <span class="statusbar__value">{remainingMines(state)}</span>
        </div>
        <div class="statusbar__item" data-testid="timer">
          <span class="statusbar__label">用时</span>
          <span class="statusbar__value">{formatTime(store.getElapsedMs())}</span>
        </div>
        <div class="statusbar__item" data-testid="status">
          <span class="statusbar__value">{statusText(state, pending)}</span>
        </div>
      </header>

      {error && (
        <div class="banner banner--error" data-testid="error" role="alert">
          <span>{ERROR_TEXT[error]}</span>
          <button type="button" onClick={() => startNew(config)}>
            重试
          </button>
        </div>
      )}

      <div class="board-host" ref={boardHost} data-testid="board" />
      {pending && <div class="pending" data-testid="pending">生成无猜棋盘…</div>}

      <div class="controls">
        <select
          class="controls__preset"
          aria-label="难度"
          value={presetIdOf(config)}
          onChange={(event) => {
            const next = PRESETS_MAP[event.currentTarget.value];
            if (next) onNewConfig(next);
          }}
        >
          {PRESET_OPTIONS.map((preset) => (
            <option value={preset.id} key={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="controls__reveal"
          data-testid="reveal-mode"
          onClick={() =>
            settings.set({ revealMode: revealMode === "release" ? "press" : "release" })
          }
        >
          {REVEAL_MODE_LABELS[revealMode]}
        </button>
        <button type="button" class="controls__new" onClick={() => startNew(config)}>
          新游戏
        </button>
      </div>
    </main>
  );
}
