import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DEFAULT_PRESET, PRESETS } from "../core/presets.ts";
import { boardKey, remainingMines } from "../core/rules.ts";
import type { BoardConfig, BoardKey, GameAction, GameState } from "../core/types.ts";
import { BoardView } from "../ui/boardView.ts";
import { Store } from "./store.ts";

export interface DebugApi {
  getState(): GameState;
  dispatch(action: GameAction): void;
  snapshot(): { state: GameState; boardKey: BoardKey | null; elapsedMs: number };
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

function statusText(state: GameState): string {
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

export function App({
  config,
  seed,
  onNewConfig,
}: {
  config: BoardConfig;
  seed?: number;
  onNewConfig: (config: BoardConfig) => void;
}) {
  const [store, setStore] = useState(() => new Store(config, seed ?? randomSeed()));
  const boardHost = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  const view = useMemo(
    () =>
      new BoardView({
        onReveal: (index) => store.dispatch({ type: "reveal", index }),
        onFlag: (index) => store.dispatch({ type: "toggleFlag", index }),
        onChord: (index) => store.dispatch({ type: "chord", index }),
      }),
    [store],
  );

  useEffect(() => {
    boardHost.current?.replaceChildren(view.el);
    view.render(store.getState());
    const unsubscribe = store.subscribe(() => {
      view.render(store.getState());
      forceRender((n) => n + 1);
    });
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
      }),
    };
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [store, view]);

  const state = store.getState();

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
          <span class="statusbar__value">{statusText(state)}</span>
        </div>
      </header>

      <div class="board-host" ref={boardHost} data-testid="board" />

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
          class="controls__new"
          onClick={() => setStore(new Store(config, randomSeed()))}
        >
          新游戏
        </button>
      </div>
    </main>
  );
}
