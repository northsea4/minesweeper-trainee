import {
  type CustomPreset,
  validateCustomPreset,
  withUniqueName,
} from "../core/customPresets.ts";
import type { SavedGame } from "../core/save.ts";
import { META_STORE, openDb, PRESETS_STORE, requestDone, transactionDone } from "./db.ts";

const SAVE_KEY = "current-save";
const LS_PRESETS = "minesweeper-trainee.presets";
const LS_SAVE = "minesweeper-trainee.save";

export class PersistenceStore {
  private presets: CustomPreset[] = [];
  private save: SavedGame | null = null;
  private listeners = new Set<() => void>();
  private ready: Promise<void>;
  private degraded = false;

  constructor() {
    this.ready = this.load();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  listPresets(): CustomPreset[] {
    return this.presets;
  }

  getSave(): SavedGame | null {
    return this.save;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async addPreset(input: {
    name: string;
    width: number;
    height: number;
    mines: number;
  }): Promise<CustomPreset | null> {
    await this.ready;
    const validated = validateCustomPreset(input, Date.now());
    if (!validated.ok) return null;
    const preset = withUniqueName(validated.preset, this.presets);
    this.presets = [...this.presets, preset];
    await this.persistPresets();
    this.emit();
    return preset;
  }

  async deletePreset(id: string): Promise<void> {
    await this.ready;
    this.presets = this.presets.filter((preset) => preset.id !== id);
    await this.persistPresets();
    this.emit();
  }

  async setPresets(presets: CustomPreset[]): Promise<void> {
    await this.ready;
    this.presets = presets;
    await this.persistPresets();
    this.emit();
  }

  async setSave(save: SavedGame | null): Promise<void> {
    await this.ready;
    this.save = save;
    await this.persistSave();
    this.emit();
  }

  private async load(): Promise<void> {
    const db = await openDb();
    if (!db) {
      this.loadFallback();
      return;
    }
    try {
      const tx = db.transaction([PRESETS_STORE, META_STORE], "readonly");
      const presetsRequest = tx.objectStore(PRESETS_STORE).getAll();
      const saveRequest = tx.objectStore(META_STORE).get(SAVE_KEY);
      await requestDone(presetsRequest);
      await requestDone(saveRequest);
      this.presets = (presetsRequest.result as CustomPreset[]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      this.save = (saveRequest.result as SavedGame | undefined) ?? null;
      this.emit();
    } catch {
      this.loadFallback();
    }
  }

  private async persistPresets(): Promise<void> {
    const db = await openDb();
    if (!db) {
      writeLocal(LS_PRESETS, this.presets);
      return;
    }
    try {
      const tx = db.transaction(PRESETS_STORE, "readwrite");
      const store = tx.objectStore(PRESETS_STORE);
      store.clear();
      for (const preset of this.presets) store.put(preset);
      await transactionDone(tx);
    } catch {
      this.markDegraded();
      writeLocal(LS_PRESETS, this.presets);
    }
  }

  private async persistSave(): Promise<void> {
    const db = await openDb();
    if (!db) {
      writeLocal(LS_SAVE, this.save);
      return;
    }
    try {
      const tx = db.transaction(META_STORE, "readwrite");
      const store = tx.objectStore(META_STORE);
      if (this.save) store.put(this.save, SAVE_KEY);
      else store.delete(SAVE_KEY);
      await transactionDone(tx);
    } catch {
      this.markDegraded();
      writeLocal(LS_SAVE, this.save);
    }
  }

  private markDegraded(): void {
    if (this.degraded) return;
    this.degraded = true;
    this.emit();
  }

  private loadFallback(): void {
    if (typeof localStorage === "undefined") return;
    this.presets = readLocal<CustomPreset[]>(LS_PRESETS) ?? [];
    this.save = readLocal<SavedGame | null>(LS_SAVE) ?? null;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    void 0;
  }
}

function readLocal<T>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
