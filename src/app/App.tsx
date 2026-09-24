import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GenerateFailure } from "../core/generator.ts";
import { DEFAULT_PRESET, PRESETS } from "../core/presets.ts";
import { boardKey, isPlayable, remainingMines } from "../core/rules.ts";
import type { BoardConfig, BoardKey, GameAction, GameMode, GameState } from "../core/types.ts";
import {
  fmtDuration,
  makeRecord,
  outcomeOf,
  personalBest,
  recentFor,
  type GameRecord,
} from "../core/records.ts";
import { presetToConfig, type CustomPreset } from "../core/customPresets.ts";
import { isResumable, serializeGame } from "../core/save.ts";
import { shouldNudge } from "../core/training.ts";
import {
  applyImport,
  buildBundle,
  parseBundle,
  serializeBundle,
  type ImportMode,
} from "../core/transfer.ts";
import { BoardView } from "../ui/boardView.ts";
import { CONFLICT_TEXT, NO_AID_TEXT, presentAid } from "../ui/aidText.ts";
import { HistoryStore } from "./history.ts";
import { PersistenceStore } from "./persistence.ts";
import { clearAllLocalData } from "./privacy.ts";
import { Sensory } from "./sensory.ts";
import { settings, type RevealMode, type ThemeChoice } from "./settings.ts";
import { Store, type AidState } from "./store.ts";
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
    aidKind: string | null;
    aidTarget: number | null;
    aidConflict: boolean;
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
  const solver = useSingleton(() => new WorkerSolver());
  const sensory = useSingleton(() => new Sensory(settings));
  const history = useSingleton(() => new HistoryStore());
  const persistence = useSingleton(() => new PersistenceStore());
  const [store, setStore] = useState(() => new Store(config, seed ?? randomSeed(), mode, solver));
  const boardHost = useRef<HTMLDivElement>(null);
  const lastStatus = useRef(store.getState().status);
  const recorded = useRef(false);
  const restored = useRef(false);
  const [, forceRender] = useState(0);
  const [presetForm, setPresetForm] = useState({ name: "", width: 9, height: 9, mines: 10 });
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [dataMessage, setDataMessage] = useState("");
  const [nudging, setNudging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const disarm = sensory.armOnFirstGesture();
    return () => {
      disarm();
      solver.dispose();
    };
  }, [solver, sensory]);

  useEffect(() => applyTheme(settings), []);

  const gamesWon = history.list().filter((record) => record.outcome === "won").length;
  useEffect(() => {
    store.setGamesWon(gamesWon);
  }, [gamesWon, store]);

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
    applyAid(view, store);
    view.render(store.getState());
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getState();
      if (snapshot.status !== lastStatus.current) {
        if (snapshot.status === "won") sensory.cue("win");
        else if (snapshot.status === "lost") sensory.cue("lose");
        lastStatus.current = snapshot.status;
        const outcome = outcomeOf(snapshot.status);
        if (outcome && !recorded.current) {
          recorded.current = true;
          void history.add(
            makeRecord({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              config,
              boardKey: boardKey(snapshot),
              mode: snapshot.mode,
              outcome,
              durationMs: store.getElapsedMs(),
              aids: store.getAidUsage(),
              timestamp: Date.now(),
            }),
          );
        } else if (snapshot.status === "ready") {
          recorded.current = false;
        }
      }
      applyAid(view, store);
      view.render(snapshot);
      const current = store.getState();
      if (current.board && (current.status === "playing" || current.status === "paused")) {
        void persistence.setSave(serializeGame(current, store.getElapsedMs(), Date.now()));
      } else if (current.status !== "ready") {
        void persistence.setSave(null);
      }
      forceRender((n) => n + 1);
    });
    const unsubscribeHistory = history.subscribe(() => forceRender((n) => n + 1));
    void history.whenReady().then(() => forceRender((n) => n + 1));
    const unsubscribePersistence = persistence.subscribe(() => forceRender((n) => n + 1));
    if (!restored.current) {
      restored.current = true;
      void persistence.whenReady().then(() => {
        const saved = persistence.getSave();
        if (isResumable(saved)) setStore(Store.fromSaved(saved!, solver));
      });
    }
    const unsubscribeSettings = settings.subscribe(() => {
      view.render(store.getState());
      forceRender((n) => n + 1);
    });
    const timer = window.setInterval(() => {
      if (isPlayable(store.getState())) forceRender((n) => n + 1);
      setNudging(
        shouldNudge(store.getTraining(), {
          mode: store.getMode(),
          nudgeEnabled: settings.get().nudgeEnabled,
          idleMs: store.nudgeIdleMs(),
        }),
      );
    }, 500);
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
        aidKind: store.getAid()?.kind ?? null,
        aidTarget: store.getAid()?.step?.index ?? null,
        aidConflict: store.getAid()?.conflict ?? false,
      }),
    };
    return () => {
      unsubscribe();
      unsubscribeSettings();
      unsubscribeHistory();
      unsubscribePersistence();
      window.clearInterval(timer);
      store.dispose();
      view.destroy();
    };
  }, [store, view, sensory]);

  const state = store.getState();
  const aid = store.getAid();
  const { revealMode, theme, sound, haptics, numberDots } = settings.get();
  const pending = store.isPending();
  const error = store.getError();
  const paused = state.status === "paused";
  const canPause = state.status === "playing" || state.status === "paused";
  const canGiveUp = state.status === "playing" || state.status === "paused";

  const startNewGame = (nextConfig: BoardConfig, nextMode: GameMode) => {
    void persistence.setSave(null);
    onNewGame(nextConfig, nextMode);
  };

  const savePreset = async () => {
    const created = await persistence.addPreset(presetForm);
    if (!created) {
      setDataMessage("预设不合法：宽高 ≥ 3、1 ≤ 雷数 ≤ 面积 − 9、面积 ≤ 10000");
      return;
    }
    setPresetForm({ ...presetForm, name: "" });
    setDataMessage(`已保存预设「${created.name}」`);
  };

  const exportData = (presetsOnly: boolean) => {
    const bundle = buildBundle({
      presets: persistence.listPresets(),
      records: history.list(),
      save: persistence.getSave(),
      presetsOnly,
      now: Date.now(),
    });
    download(`minesweeper-${presetsOnly ? "presets" : "data"}.json`, serializeBundle(bundle));
    setDataMessage("已导出");
  };

  const importData = async (file: File) => {
    const parsed = parseBundle(await file.text());
    if (!parsed.ok) {
      setDataMessage(`导入失败：${parsed.reason}`);
      return;
    }
    const local = buildBundle({
      presets: persistence.listPresets(),
      records: history.list(),
      save: persistence.getSave(),
      now: Date.now(),
    });
    const result = applyImport(local, parsed.bundle, importMode);
    await persistence.setPresets(result.presets);
    await history.setRecords(result.records);
    if (importMode === "replace") await persistence.setSave(result.save);
    setDataMessage(importMode === "merge" ? "已合并导入" : "已替换导入");
  };
  const records = history.list();
  const best = personalBest(records, config);
  const recent = recentFor(records, config, 200);
  const presets = persistence.listPresets();
  const presetBests = [
    ...PRESETS.map((preset) => ({
      name: preset.name,
      config: { width: preset.width, height: preset.height, mines: preset.mines },
    })),
    ...presets.map((preset) => ({ name: preset.name, config: presetToConfig(preset) })),
  ].map((entry) => ({ name: entry.name, pb: personalBest(records, entry.config) }));
  const storageDegraded = persistence.isDegraded() || history.isDegraded();

  return (
    <main class="app">
      <header class="statusbar">
        <div class="statusbar__item" data-testid="remaining">
          <span class="statusbar__label">剩余雷数</span>
          <span class="statusbar__value">{remainingMines(state)}</span>
        </div>
        <div class="statusbar__item" data-testid="timer">
          <span class="statusbar__label">用时</span>
          <span class="statusbar__value">{fmtDuration(store.getElapsedMs())}</span>
        </div>
        <div class="statusbar__item" data-testid="status">
          <span class="statusbar__value">{statusText(state, pending)}</span>
        </div>
      </header>

      <div class="hintbar" data-testid="hintbar" aria-live="polite">
        {aidMessage(aid)}
      </div>

      {error && (
        <div class="banner banner--error" data-testid="error" role="alert">
          <span>{ERROR_TEXT[error]}</span>
          <button type="button" onClick={() => startNewGame(config, mode)}>
            重试
          </button>
        </div>
      )}

      {storageDegraded && (
        <div class="banner banner--warn" data-testid="storage-warning" role="status">
          <span>本地存储空间不足，游戏仍可继续，建议导出数据或清理旧历史。</span>
          <button type="button" onClick={() => exportData(false)}>
            导出数据
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

      {mode === "training" && (
        <div class="aids" data-testid="aids">
          <button
            type="button"
            class={`aids__button${nudging ? " aids__button--nudge" : ""}`}
            data-testid="help"
            disabled={state.status !== "playing" || store.isHelpBlocked()}
            onClick={() => store.requestHelp()}
          >
            帮帮我
          </button>
          {aid?.kind === "leader" && (
            <button
              type="button"
              class="aids__button"
              data-testid="stop-leader"
              onClick={() => store.stopLeader()}
            >
              停止领航
            </button>
          )}
        </div>
      )}

      <div class="controls">
        <select
          class="controls__preset"
          aria-label="难度"
          value={presetIdOf(config)}
          onChange={(event) => {
            const next = PRESETS_MAP[event.currentTarget.value];
            if (next) startNewGame(next, mode);
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
          onChange={(event) => startNewGame(config, event.currentTarget.value as GameMode)}
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
        <button type="button" class="controls__new" onClick={() => startNewGame(config, mode)}>
          新游戏
        </button>
      </div>

      <details class="history" data-testid="presets">
        <summary>预设与数据</summary>
        <div class="history__body">
          <ul class="history__list">
            {presets.length === 0 && <li class="history__empty">还没有自定义预设</li>}
            {presets.map((preset: CustomPreset) => (
              <li class="history__item" data-testid="preset-item" key={preset.id}>
                <span>{preset.name}</span>
                <span>
                  {preset.width}×{preset.height} · {preset.mines} 雷
                </span>
                <button type="button" onClick={() => startNewGame(presetToConfig(preset), mode)}>
                  使用
                </button>
                <button type="button" onClick={() => void persistence.deletePreset(preset.id)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
          <form
            class="preset-form"
            onSubmit={(event) => {
              event.preventDefault();
              void savePreset();
            }}
          >
            <input
              aria-label="预设名称"
              placeholder="名称"
              value={presetForm.name}
              onInput={(event) =>
                setPresetForm({ ...presetForm, name: event.currentTarget.value })
              }
            />
            <input
              type="number"
              aria-label="宽度"
              min={3}
              value={presetForm.width}
              onInput={(event) =>
                setPresetForm({ ...presetForm, width: Number(event.currentTarget.value) })
              }
            />
            <input
              type="number"
              aria-label="高度"
              min={3}
              value={presetForm.height}
              onInput={(event) =>
                setPresetForm({ ...presetForm, height: Number(event.currentTarget.value) })
              }
            />
            <input
              type="number"
              aria-label="雷数"
              min={1}
              value={presetForm.mines}
              onInput={(event) =>
                setPresetForm({ ...presetForm, mines: Number(event.currentTarget.value) })
              }
            />
            <button type="submit" data-testid="save-preset">
              保存预设
            </button>
          </form>
          <div class="preset-data">
            <button type="button" data-testid="export-all" onClick={() => exportData(false)}>
              导出全部
            </button>
            <button type="button" data-testid="export-presets" onClick={() => exportData(true)}>
              仅导出预设
            </button>
            <select
              aria-label="导入方式"
              data-testid="import-mode"
              value={importMode}
              onChange={(event) => setImportMode(event.currentTarget.value as ImportMode)}
            >
              <option value="merge">合并</option>
              <option value="replace">替换</option>
            </select>
            <button type="button" onClick={() => fileInput.current?.click()}>
              导入
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              data-testid="import-file"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importData(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          {dataMessage && (
            <p class="history__empty" data-testid="data-message">
              {dataMessage}
            </p>
          )}
        </div>
      </details>

      <details class="history" data-testid="history">
        <summary>历史与排行</summary>
        <div class="history__body">
          <div class="history__pb" data-testid="pb">
            个人最佳：{best ? fmtDuration(best.durationMs) : "—"}
          </div>
          <ul class="history__list" data-testid="preset-bests">
            {presetBests.map((entry) => (
              <li class="history__item" key={entry.name}>
                <span>{entry.name}</span>
                <span class="history__badge">
                  {entry.pb ? fmtDuration(entry.pb.durationMs) : "—"}
                </span>
              </li>
            ))}
          </ul>
          <ul class="history__list">
            {recent.length === 0 && <li class="history__empty">还没有对局记录</li>}
            {recent.map((r) => (
              <li class="history__item" data-testid="history-item" key={r.id}>
                <span class="history__mode">{r.mode === "training" ? "训练" : "挑战"}</span>
                <span>{outcomeLabel(r)}</span>
                <span>{fmtDuration(r.durationMs)}</span>
                <span class="history__badge">
                  {r.mode === "training" ? "训练 · 不计排名" : r.valid ? "有效" : "无结果"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>

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
          <label class="settings__row">
            <span>轻推求助</span>
            <input
              type="checkbox"
              data-testid="nudge"
              checked={settings.get().nudgeEnabled}
              onChange={(event) => settings.set({ nudgeEnabled: event.currentTarget.checked })}
            />
          </label>
          <div class="settings__row">
            <span>本地数据</span>
            <button
              type="button"
              data-testid="clear-data"
              onClick={() => void clearAllLocalData().then(() => window.location.reload())}
            >
              清空本地数据
            </button>
          </div>
        </div>
      </details>
    </main>
  );
}

function applyAid(view: BoardView, store: Store): void {
  const aid = store.getAid();
  if (!aid?.step) {
    view.setHighlight(null);
    return;
  }
  const presentation = presentAid(aid.step, aid.kind !== "hint");
  view.setHighlight({
    cells: [...presentation.highlight, ...presentation.conclusion],
    kind: presentation.kind,
    target: presentation.target,
  });
}

function aidMessage(aid: AidState | null): string {
  if (!aid) return "";
  if (aid.step) {
    const presentation = presentAid(aid.step, aid.kind !== "hint");
    return aid.conflict ? `${presentation.text} ${CONFLICT_TEXT}` : presentation.text;
  }
  return aid.conflict ? CONFLICT_TEXT : NO_AID_TEXT;
}

function useSingleton<T>(factory: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = factory();
  return ref.current;
}

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function outcomeLabel(record: GameRecord): string {
  switch (record.outcome) {
    case "won":
      return "胜利";
    case "lost":
      return "失败";
    case "abandoned":
      return "放弃";
  }
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
