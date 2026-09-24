import type { GameRecord } from "../core/records.ts";
import { openDb, RECORDS_STORE, requestDone, transactionDone } from "./db.ts";

const LS_KEY = "minesweeper-trainee.records";

export class HistoryStore {
  private records: GameRecord[] = [];
  private listeners = new Set<() => void>();
  private ready: Promise<void>;
  private degraded = false;

  constructor() {
    this.ready = this.load();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  list(): GameRecord[] {
    return this.records;
  }

  async add(record: GameRecord): Promise<void> {
    await this.ready;
    this.records.push(record);
    await this.persist(record);
    this.emit();
  }

  async setRecords(records: GameRecord[]): Promise<void> {
    await this.ready;
    this.records = records;
    const db = await openDb();
    if (db) {
      try {
        const tx = db.transaction(RECORDS_STORE, "readwrite");
        const store = tx.objectStore(RECORDS_STORE);
        store.clear();
        for (const record of records) store.put(record);
        await transactionDone(tx);
      } catch {
        void 0;
      }
    } else if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(records));
      } catch {
        void 0;
      }
    }
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async load(): Promise<void> {
    const db = await openDb();
    if (!db) {
      this.loadFallback();
      return;
    }
    try {
      const tx = db.transaction(RECORDS_STORE, "readonly");
      const getAll = tx.objectStore(RECORDS_STORE).getAll();
      await requestDone(getAll);
      this.records = (getAll.result as GameRecord[]).sort((a, b) => a.timestamp - b.timestamp);
      this.emit();
    } catch {
      this.loadFallback();
    }
  }

  private async persist(record: GameRecord): Promise<void> {
    const db = await openDb();
    if (db) {
      try {
        const tx = db.transaction(RECORDS_STORE, "readwrite");
        tx.objectStore(RECORDS_STORE).put(record);
        await transactionDone(tx);
        return;
      } catch {
        this.degraded = true;
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
