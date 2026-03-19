/**
 * Reactive upload queue built on uploadEngine.
 * Two pre-configured instances are exported: storyQueue and galleryQueue.
 * Components subscribe via useSyncExternalStore.
 */

import { uploadFile, abortRemoteUpload, type UploadProgress } from "./uploadEngine";

export type UploadTaskStatus = "queued" | "uploading" | "completed" | "failed" | "aborted";

export interface UploadTask {
  id: string;
  file: File;
  status: UploadTaskStatus;
  progress: number;
  bytesUploaded: number;
  totalParts: number;
  completedParts: number;
  startedAt: number;
  finishedAt?: number;
  etaSeconds?: number;
  error?: string;
  uploadId?: string;
  key?: string;
  resultUrl?: string;
  result?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

type Listener = () => void;

interface CreateQueueOptions {
  maxFileConcurrent?: number;
  maxPartConcurrent?: number;
  maxRetries?: number;
}

function computeEta(startedAt: number, bytesUploaded: number, totalBytes: number): number | undefined {
  if (bytesUploaded <= 0 || totalBytes <= bytesUploaded) return 0;
  const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
  const speed = bytesUploaded / elapsed;
  if (!Number.isFinite(speed) || speed <= 0) return undefined;
  return Math.max(0, Math.round((totalBytes - bytesUploaded) / speed));
}

export function createUploadQueue(opts: CreateQueueOptions = {}) {
  const { maxFileConcurrent = 1, maxPartConcurrent = 5, maxRetries = 3 } = opts;

  const tasks = new Map<string, UploadTask>();
  const listeners = new Set<Listener>();
  const abortControllers = new Map<string, AbortController>();
  let snapshot: UploadTask[] = [];
  const pending: string[] = [];
  let running = 0;

  function notify() {
    snapshot = Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
    listeners.forEach((fn) => fn());
  }

  function patchTask(id: string, patch: Partial<UploadTask>) {
    const cur = tasks.get(id);
    if (!cur) return;
    tasks.set(id, { ...cur, ...patch });
    notify();
  }

  function drainQueue() {
    while (running < maxFileConcurrent && pending.length > 0) {
      const next = pending.shift()!;
      const task = tasks.get(next);
      if (task && task.status === "queued") processTask(next);
    }
  }

  async function processTask(taskId: string) {
    const task = tasks.get(taskId);
    if (!task || task.status !== "queued") return;

    const controller = new AbortController();
    abortControllers.set(taskId, controller);
    running++;

    patchTask(taskId, { status: "uploading", startedAt: Date.now() });

    try {
      const result = await uploadFile({
        file: task.file,
        metadata: task.metadata,
        maxConcurrent: maxPartConcurrent,
        maxRetries,
        signal: controller.signal,
        onProgress(p: UploadProgress) {
          const cur = tasks.get(taskId);
          if (!cur || cur.status !== "uploading") return;
          patchTask(taskId, {
            completedParts: p.completedParts,
            totalParts: p.totalParts,
            bytesUploaded: p.bytesUploaded,
            progress: Math.min(95, Math.max(1, Math.round((p.bytesUploaded / p.totalBytes) * 95))),
            etaSeconds: computeEta(cur.startedAt, p.bytesUploaded, p.totalBytes),
          });
        },
      });

      patchTask(taskId, {
        status: "completed",
        progress: 100,
        bytesUploaded: task.file.size,
        etaSeconds: 0,
        finishedAt: Date.now(),
        key: result.key,
        uploadId: result.uploadId,
        resultUrl: result.url,
        result: result as Record<string, unknown>,
      });
    } catch (e: unknown) {
      const cur = tasks.get(taskId);
      if (cur?.status === "aborted") return;
      const msg = e instanceof Error ? e.message : "Upload failed";
      patchTask(taskId, {
        status: controller.signal.aborted ? "aborted" : "failed",
        error: msg,
        finishedAt: Date.now(),
      });
    } finally {
      abortControllers.delete(taskId);
      running--;
      drainQueue();
    }
  }

  function makeId() {
    return `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  return {
    addFile(file: File, metadata: Record<string, unknown> = {}): string {
      const id = makeId();
      tasks.set(id, {
        id,
        file,
        status: "queued",
        progress: 0,
        bytesUploaded: 0,
        totalParts: 0,
        completedParts: 0,
        startedAt: Date.now(),
        metadata,
      });
      pending.push(id);
      notify();
      drainQueue();
      return id;
    },

    addFiles(files: File[], sharedMetadata: Record<string, unknown> = {}): string[] {
      const ids: string[] = [];
      for (const file of files) {
        const id = makeId();
        tasks.set(id, {
          id,
          file,
          status: "queued",
          progress: 0,
          bytesUploaded: 0,
          totalParts: 0,
          completedParts: 0,
          startedAt: Date.now(),
          metadata: { ...sharedMetadata },
        });
        pending.push(id);
        ids.push(id);
      }
      notify();
      drainQueue();
      return ids;
    },

    cancel(taskId: string) {
      const task = tasks.get(taskId);
      if (!task) return;
      const idx = pending.indexOf(taskId);
      if (idx >= 0) pending.splice(idx, 1);
      const controller = abortControllers.get(taskId);
      if (controller) {
        controller.abort();
        abortControllers.delete(taskId);
      }
      patchTask(taskId, { status: "aborted", error: "Upload cancelled", finishedAt: Date.now() });
      if (task.uploadId && task.key) abortRemoteUpload(task.uploadId, task.key);
    },

    dismiss(taskId: string) {
      const task = tasks.get(taskId);
      if (!task || task.status === "uploading" || task.status === "queued") return;
      tasks.delete(taskId);
      notify();
    },

    clearFinished() {
      for (const [id, task] of tasks.entries()) {
        if (task.status === "completed" || task.status === "failed" || task.status === "aborted") {
          tasks.delete(id);
        }
      }
      notify();
    },

    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): UploadTask[] {
      return snapshot;
    },

    getTask(taskId: string): UploadTask | undefined {
      return tasks.get(taskId);
    },

    findTask(predicate: (t: UploadTask) => boolean): UploadTask | undefined {
      return Array.from(tasks.values()).find(predicate);
    },

    getActiveCount(): number {
      return Array.from(tasks.values()).filter(
        (t) => t.status === "uploading" || t.status === "queued",
      ).length;
    },
  };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;

export const storyQueue = createUploadQueue({
  maxFileConcurrent: 1,
  maxPartConcurrent: 5,
  maxRetries: 3,
});

export const galleryQueue = createUploadQueue({
  maxFileConcurrent: 3,
  maxPartConcurrent: 5,
  maxRetries: 3,
});
