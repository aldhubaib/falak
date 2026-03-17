/**
 * Global singleton upload manager.
 * Lives outside React — survives route changes so uploads continue in background.
 * Components subscribe to updates via listeners.
 */

export interface UploadTask {
  id: string;
  storyId: string;
  file: File;
  status: "uploading" | "completed" | "failed" | "aborted";
  progress: number; // 0-100
  uploadId: string | null;
  key: string | null;
  error: string | null;
  videoUrl: string | null;
  completedParts: number;
  totalParts: number;
}

type Listener = () => void;

const tasks = new Map<string, UploadTask>();
const listeners = new Set<Listener>();
let cachedSnapshot: UploadTask[] = [];

function notify() {
  cachedSnapshot = Array.from(tasks.values());
  listeners.forEach((fn) => fn());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTasks(): UploadTask[] {
  return cachedSnapshot;
}

export function getTaskByStoryId(storyId: string): UploadTask | undefined {
  return Array.from(tasks.values()).find((t) => t.storyId === storyId);
}

export function getActiveCount(): number {
  return Array.from(tasks.values()).filter((t) => t.status === "uploading").length;
}

export function removeTask(id: string) {
  tasks.delete(id);
  notify();
}

const abortControllers = new Map<string, AbortController>();

export async function startUpload(storyId: string, file: File): Promise<string> {
  const existing = getTaskByStoryId(storyId);
  if (existing && existing.status === "uploading") {
    throw new Error("Upload already in progress for this story");
  }

  const taskId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const task: UploadTask = {
    id: taskId,
    storyId,
    file,
    status: "uploading",
    progress: 0,
    uploadId: null,
    key: null,
    error: null,
    videoUrl: null,
    completedParts: 0,
    totalParts: 0,
  };
  tasks.set(taskId, task);
  notify();

  const controller = new AbortController();
  abortControllers.set(taskId, controller);

  doUpload(task, controller.signal).catch(() => {});
  return taskId;
}

export function abortUpload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task || task.status !== "uploading") return;

  const controller = abortControllers.get(taskId);
  if (controller) controller.abort();
  abortControllers.delete(taskId);

  task.status = "aborted";
  task.error = "Upload cancelled";
  notify();

  if (task.uploadId && task.key) {
    fetch("/api/upload/abort", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: task.uploadId, key: task.key }),
    }).catch(() => {});
  }
}

const MAX_CONCURRENT = 3;

async function doUpload(task: UploadTask, signal: AbortSignal) {
  try {
    // 1. Init multipart upload
    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: task.file.name,
        fileSize: task.file.size,
        contentType: task.file.type || "video/mp4",
        storyId: task.storyId,
      }),
      signal,
    });
    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({ error: "Init failed" }));
      throw new Error(err.error || "Failed to start upload");
    }

    const { uploadId, key, chunkSize, totalParts, presignedUrls } = await initRes.json();
    task.uploadId = uploadId;
    task.key = key;
    task.totalParts = totalParts;
    notify();

    // 2. Upload chunks with concurrency limit
    const parts: { partNumber: number; etag: string }[] = [];

    async function uploadPart(partInfo: { partNumber: number; url: string }) {
      if (signal.aborted) return;
      const start = (partInfo.partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, task.file.size);
      const chunk = task.file.slice(start, end);

      const res = await fetch(partInfo.url, {
        method: "PUT",
        body: chunk,
        signal,
      });

      if (!res.ok) throw new Error(`Part ${partInfo.partNumber} upload failed (${res.status})`);

      const etag = res.headers.get("ETag") || `"part-${partInfo.partNumber}"`;
      parts.push({ partNumber: partInfo.partNumber, etag });
      task.completedParts++;
      task.progress = Math.round((task.completedParts / task.totalParts) * 95); // reserve 5% for completion
      notify();
    }

    // Process in batches of MAX_CONCURRENT
    for (let i = 0; i < presignedUrls.length; i += MAX_CONCURRENT) {
      if (signal.aborted) throw new Error("Aborted");
      const batch = presignedUrls.slice(i, i + MAX_CONCURRENT);
      await Promise.all(batch.map(uploadPart));
    }

    if (signal.aborted) throw new Error("Aborted");

    // 3. Complete the multipart upload
    parts.sort((a, b) => a.partNumber - b.partNumber);
    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId,
        key,
        parts,
        storyId: task.storyId,
        fileName: task.file.name,
        fileSize: task.file.size,
      }),
      signal,
    });

    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({ error: "Complete failed" }));
      throw new Error(err.error || "Failed to finalize upload");
    }

    const { url } = await completeRes.json();
    task.videoUrl = url;
    task.status = "completed";
    task.progress = 100;
    abortControllers.delete(task.id);
    notify();
  } catch (e: any) {
    if (task.status === "aborted") return;
    task.status = "failed";
    task.error = e?.message || "Upload failed";
    abortControllers.delete(task.id);
    notify();
  }
}
