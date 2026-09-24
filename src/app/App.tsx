import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GenerateFailure } from "../core/generator.ts";
import { DEFAULT_PRESET, PRESETS } from "../core/presets.ts";
import { boardKey, isPlayable, remainingMines } from "../core/rules.ts";
import type { BoardConfig, BoardKey, GameAction, GameMode, GameState } from "../core/types.ts";
import { BoardView } from "../ui/boardView.ts";
import { Sensory } from "./sensory.ts";
import { settings, type RevealMode, type ThemeChoice } from "./settings.ts";
import { Store } from "./store.ts";
import { WorkerSolver } from "../worker/solverClient.ts";

export interface DebugApi {
  getState(): GameState;
  dispatch(action: GameAction): void;
  snapshot(): {
    state: GameState;
    boardKey: BoardKey | null;
    elapsedMs: number;
    mode: GameMode;
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
    case "paused":
      return state.mode === "challenge" ? "已暂停（计时继续）" : "已暂停";
    case "won":
      return "胜利！";
    case "lost":
      return "触雷了";
    case "abandoned":
      return "已放弃";
  }
}

const REVEAL_MODE_LABELS: Record<RevealMode, string> = {
  release: "松手确认",
  press: "按下即生效",
};

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export function App({
  config,
  seed,
  mode,
  onNewGame,
}: {
  config: BoardConfig;
  seed?: number;
  mode: GameMode;
  onNewGame: (config: BoardConfig, mode: GameMode) => void;
}) {
  const solver = useRef(new WorkerSolver()).current;
  const sensory = useRef(new Sensory(settings)).current;
  const [store] = useState(() => new Store(config, seed ?? randomSeed(), mode, solver));
  const boardHost = useRef<HTMLDivElement>(null);
  const lastStatus = useRef(store.getState().status);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const disarm = sensory.armOnFirstGesture();
    return () => {
      disarm();
      solver.dispose();
    };
  }, [solver, sensory]);

  useEffect(() => applyTheme(settings), []);

  const view = useMemo(
    () =>
      new BoardView(
        {
          onReveal: (index) => {
            sensory.cue("reveal");
            store.dispatch({ type: "reveal", index });
          },
          onFlag: (index) => {
            sensory.cue("flag");
            store.dispatch({ type: "toggleFlag", index });
          },
          onChord: (index) => {
            sensory.cue("chord");
            store.dispatch({ type: "chord", index });
          },
        },
        {
          getRevealMode: () => settings.get().revealMode,
          isLocked: () =>
            store.isFrozen() || store.isPending() || !isPlayable(store.getState()),
          showNumberDots: () => settings.get().numberDots,
        },
      ),
    [store, sensory],
  );

  useEffect(() => {
    if (boardHost.current) view.mount(boardHost.current);
    view.render(store.getState());
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getState();
      if (snapshot.status !== lastStatus.current) {
        if (snapshot.status === "won") sensory.cue("win");
        else if (snapshot.status === "lost") sensory.cue("lose");
        lastStatus.current = snapshot.status;
      }
      view.render(snapshot);
      forceRender((n) => n + 1);
    });
    const unsubscribeSettings = settings.subscribe(() => {
      view.render(store.getState());
      forceRender((n) => n + 1);
    });
    const timer = window.setInterval(() => {
      if (isPlayable(store.getState())) forceRender((n) => n + 1);
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
  }, [store, view, sensory]);

  const state = store.getState();
  const { revealMode, theme, sound, haptics, numberDots } = settings.get();
  const pending = store.isPending();
  const error = store.getError();
  const paused = state.status === "paused";
  const canPause = state.status === "playing" || state.status === "paused";
  const canGiveUp = state.status === "playing" || state.status === "paused";

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

      <div class="hintbar" data-testid="hintbar" aria-live="polite" />

      {error && (
        <div class="banner banner--error" data-testid="error" role="alert">
          <span>{ERROR_TEXT[error]}</span>
          <button type="button" onClick={() => onNewGame(config, mode)}>
            重试
          </button>
        </div>
      )}

      <div class="board-wrap">
        <div class="board-host" ref={boardHost} data-testid="board" />
        {paused && (
          <div class="pause-mask" data-testid="pause-mask">
            <span>已暂停</span>
            <button type="button" onClick={() => store.dispatch({ type: "resume" })}>
              继续
            </button>
          </div>
        )}
      </div>
      {pending && <div class="pending" data-testid="pending">生成无猜棋盘…</div>}

      <div class="controls">
        <select
          class="controls__preset"
          aria-label="难度"
          value={presetIdOf(config)}
          onChange={(event) => {
            const next = PRESETS_MAP[event.currentTarget.value];
            if (next) onNewGame(next, mode);
          }}
        >
          {PRESET_OPTIONS.map((preset) => (
            <option value={preset.id} key={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <select
          class="controls__mode"
          aria-label="模式"
          data-testid="mode"
          value={mode}
          onChange={(event) => onNewGame(config, event.currentTarget.value as GameMode)}
        >
          <option value="training">训练</option>
          <option value="challenge">计时挑战</option>
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
        <button
          type="button"
          class="controls__pause"
          data-testid="pause"
          disabled={!canPause}
          onClick={() => store.dispatch({ type: paused ? "resume" : "pause" })}
        >
          {paused ? "继续" : "暂停"}
        </button>
        <button
          type="button"
          class="controls__giveup"
          data-testid="giveup"
          disabled={!canGiveUp}
          onClick={() => store.dispatch({ type: "giveUp" })}
        >
          放弃
        </button>
        <button type="button" class="controls__new" onClick={() => onNewGame(config, mode)}>
          新游戏
        </button>
      </div>

      <details class="settings" data-testid="settings">
        <summary>设置</summary>
        <div class="settings__grid">
          <label class="settings__row">
            <span>主题</span>
            <select
              data-testid="theme"
              value={theme}
              onChange={(event) =>
                settings.set({ theme: event.currentTarget.value as ThemeChoice })
              }
            >
              {(Object.keys(THEME_LABELS) as ThemeChoice[]).map((choice) => (
                <option value={choice} key={choice}>
                  {THEME_LABELS[choice]}
                </option>
              ))}
            </select>
          </label>
          <label class="settings__row">
            <span>声音</span>
            <input
              type="checkbox"
              data-testid="sound"
              checked={sound}
              onChange={(event) => settings.set({ sound: event.currentTarget.checked })}
            />
          </label>
          <label class="settings__row">
            <span>触觉</span>
            <input
              type="checkbox"
              data-testid="haptics"
              checked={haptics}
              onChange={(event) => settings.set({ haptics: event.currentTarget.checked })}
            />
          </label>
          <label class="settings__row">
            <span>数字点数</span>
            <input
              type="checkbox"
              data-testid="dots"
              checked={numberDots}
              onChange={(event) => settings.set({ numberDots: event.currentTarget.checked })}
            />
          </label>
        </div>
      </details>
    </main>
  );
}

function applyTheme(store: typeof settings): () => void {
  const apply = () => {
    const choice = store.get().theme;
    if (choice === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
  };
  apply();
  return store.subscribe(apply);
}
