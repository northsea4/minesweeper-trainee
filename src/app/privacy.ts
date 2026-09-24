const DB_NAME = "minesweeper-trainee";

export async function clearAllLocalData(): Promise<void> {
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    void 0;
  }
  try {
    localStorage.clear();
  } catch {
    void 0;
  }
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      void 0;
    }
  }
  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      void 0;
    }
  }
}
