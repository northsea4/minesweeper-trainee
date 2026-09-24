export type RevealMode = "release" | "press";
export type ThemeChoice = "system" | "light" | "dark";

export interface Settings {
  revealMode: RevealMode;
  theme: ThemeChoice;
  sound: boolean;
  haptics: boolean;
  numberDots: boolean;
  nudgeEnabled: boolean;
}

const STORAGE_KEY = "minesweeper-trainee.settings";

export const DEFAULT_SETTINGS: Settings = {
  revealMode: "release",
  theme: "system",
  sound: true,
  haptics: true,
  numberDots: true,
  nudgeEnabled: true,
};

type Listener = () => void;

function readStorage(): Partial<Settings> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

function coerce(stored: Partial<Settings> | null): Settings {
  return {
    revealMode: stored?.revealMode === "press" ? "press" : DEFAULT_SETTINGS.revealMode,
    theme:
      stored?.theme === "light" || stored?.theme === "dark" ? stored.theme : "system",
    sound: stored?.sound === false ? false : DEFAULT_SETTINGS.sound,
    haptics: stored?.haptics === false ? false : DEFAULT_SETTINGS.haptics,
    numberDots: stored?.numberDots === false ? false : DEFAULT_SETTINGS.numberDots,
    nudgeEnabled: stored?.nudgeEnabled === false ? false : DEFAULT_SETTINGS.nudgeEnabled,
  };
}

export class SettingsStore {
  private settings: Settings;

  constructor(private listeners: Set<Listener> = new Set()) {
    this.settings = coerce(readStorage());
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

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settings = new SettingsStore();
