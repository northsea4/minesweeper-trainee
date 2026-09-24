export type RevealMode = "release" | "press";

export interface Settings {
  revealMode: RevealMode;
}

const STORAGE_KEY = "minesweeper-trainee.settings";

export const DEFAULT_SETTINGS: Settings = {
  revealMode: "release",
};

function readStorage(): Partial<Settings> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

export class SettingsStore {
  private settings: Settings;

  constructor(private listeners = new Set<() => void>()) {
    const stored = readStorage();
    this.settings = {
      revealMode: stored?.revealMode === "press" ? "press" : DEFAULT_SETTINGS.revealMode,
    };
  }

  get(): Settings {
    return this.settings;
  }

  set(partial: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partial };
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        void 0;
      }
    }
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settings = new SettingsStore();
