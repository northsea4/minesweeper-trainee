import { render } from "preact";
import { useState } from "preact/hooks";
import { App } from "./app/App.tsx";
import { DEFAULT_PRESET } from "./core/presets.ts";
import type { BoardConfig, GameMode } from "./core/types.ts";
import "./styles.css";

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
  return (
    <App
      key={`${config.width}x${config.height}x${config.mines}:${seed ?? "random"}:${mode}`}
      config={config}
      seed={seed}
      mode={mode}
      onNewGame={(nextConfig, nextMode) => {
        setSeed(undefined);
        setConfig(nextConfig);
        setMode(nextMode);
      }}
    />
  );
}

render(<Root />, document.getElementById("app")!);
