import { render } from "preact";
import { useState } from "preact/hooks";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App.tsx";
import { DEFAULT_PRESET } from "./core/presets.ts";
import type { BoardConfig, GameMode } from "./core/types.ts";
import "./styles.css";

registerSW({ immediate: true });
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  const reloadWhenIdle = () => {
    const status = window.__ms?.snapshot().state.status;
    if (status === "playing" || status === "paused") {
      window.setTimeout(reloadWhenIdle, 3000);
      return;
    }
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only reload when an existing shell is replaced by a newer one, and never
    // interrupt a game in progress — wait until it is idle.
    if (!hadController || reloading) return;
    reloading = true;
    reloadWhenIdle();
  });
}

function configFromUrl(): BoardConfig {
  const params = new URLSearchParams(window.location.search);
  const width = Number(params.get("w"));
  const height = Number(params.get("h"));
  const mines = Number(params.get("m"));
  if (Number.isInteger(width) && Number.isInteger(height) && Number.isInteger(mines)) {
    if (width >= 1 && height >= 1 && mines >= 0 && mines <= width * height) {
      return { width, height, mines };
    }
  }
  return { width: DEFAULT_PRESET.width, height: DEFAULT_PRESET.height, mines: DEFAULT_PRESET.mines };
}

function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) return undefined;
  const seed = Number(raw);
  return Number.isFinite(seed) ? seed >>> 0 : undefined;
}

function modeFromUrl(): GameMode {
  return new URLSearchParams(window.location.search).get("mode") === "challenge"
    ? "challenge"
    : "training";
}

function Root() {
  const [config, setConfig] = useState(configFromUrl);
  const [seed, setSeed] = useState<number | undefined>(seedFromUrl);
  const [mode, setMode] = useState<GameMode>(modeFromUrl);
  const [nonce, setNonce] = useState(0);
  return (
    <App
      key={`${config.width}x${config.height}x${config.mines}:${seed ?? "random"}:${mode}:${nonce}`}
      config={config}
      seed={seed}
      mode={mode}
      onNewGame={(nextConfig, nextMode) => {
        setSeed(undefined);
        setConfig(nextConfig);
        setMode(nextMode);
        setNonce((value) => value + 1);
      }}
    />
  );
}

render(<Root />, document.getElementById("app")!);
