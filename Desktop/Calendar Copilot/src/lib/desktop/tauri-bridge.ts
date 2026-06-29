interface WatcherStatus {
  running: boolean;
  intervalSeconds: number;
  tickCount: number;
  lastTickAt?: string | null;
  lastResult?: string | null;
  lastError?: string | null;
}

interface UpdateCheckResult {
  checked: boolean;
  updated: boolean;
  version?: string;
  notes?: string;
}

function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "__TAURI_INTERNALS__" in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauriCore = await import("@tauri-apps/api/core");
  return tauriCore.invoke<T>(command, args);
}

export async function getWatcherStatus(): Promise<WatcherStatus | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  return invokeCommand<WatcherStatus>("watcher_status");
}

export async function startWatcher(intervalSeconds: number): Promise<WatcherStatus | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  return invokeCommand<WatcherStatus>("start_watcher", { intervalSeconds });
}

export async function stopWatcher(): Promise<WatcherStatus | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  return invokeCommand<WatcherStatus>("stop_watcher");
}

export async function triggerWatcherTick(): Promise<WatcherStatus | null> {
  if (!isDesktopRuntime()) {
    return null;
  }
  return invokeCommand<WatcherStatus>("trigger_watcher_tick");
}

export async function checkForDesktopUpdate(): Promise<UpdateCheckResult> {
  if (!isDesktopRuntime()) {
    return { checked: false, updated: false };
  }

  const updater = await import("@tauri-apps/plugin-updater");
  const process = await import("@tauri-apps/plugin-process");

  const update = await updater.check();
  if (!update) {
    return { checked: true, updated: false };
  }

  await update.downloadAndInstall();
  await process.relaunch();

  return {
    checked: true,
    updated: true,
    version: update.version,
    notes: update.body,
  };
}

export type { UpdateCheckResult, WatcherStatus };
