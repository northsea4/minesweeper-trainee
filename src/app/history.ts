import type { GameRecord } from "../core/records.ts";

const DB_NAME = "minesweeper-trainee";
const STORE = "records";
const LS_KEY = "minesweeper-trainee.records";

export class HistoryStore {
  private records: GameRecord[] = [];
  private listeners = new Set<() => void>();
  private db: IDBDatabase | null = null;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.open();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  list(): GameRecord[] {
    return this.records;
  }

  async add(record: GameRecord): Promise<void> {
    await this.ready;
    this.records.push(record);
    this.persist(record);
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private open(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        this.loadFallback();
        resolve();
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, 1);
      } catch {
        this.loadFallback();
        resolve();
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => {
        this.db = request.result;
        try {
          const tx = this.db.transaction(STORE, "readonly");
          const getAll = tx.objectStore(STORE).getAll();
          getAll.onsuccess = () => {
            this.records = (getAll.result as GameRecord[]).sort((a, b) => a.timestamp - b.timestamp);
            this.emit();
            resolve();
          };
          getAll.onerror = () => {
            this.loadFallback();
            resolve();
          };
        } catch {
          this.loadFallback();
          resolve();
        }
      };
      request.onerror = () => {
        this.loadFallback();
        resolve();
      };
    });
  }

  private persist(record: GameRecord): void {
    if (this.db) {
      try {
        const tx = this.db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(record);
        return;
      } catch {
        void 0;
      }
    }
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.records));
      } catch {
        void 0;
      }
    }
  }

  private loadFallback(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      this.records = raw ? (JSON.parse(raw) as GameRecord[]) : [];
    } catch {
      this.records = [];
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
