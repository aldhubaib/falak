import { abortUpload, completeGalleryUpload, initGalleryUpload } from "@/lib/gallery-api";

const MAX_PART_CONCURRENT = 3;
const MAX_FILE_CONCURRENT = 3;
const MAX_FILES_PER_BATCH = 100;

export type GalleryUploadStatus = "queued" | "uploading" | "completed" | "failed" | "aborted";

export interface GalleryUploadTask {
  id: string;
  channelId: string;
  albumId?: string;
  name: string;
  size: number;
  type: string;
  status: GalleryUploadStatus;
  progress: number;
  uploadedBytes: number;
  startedAt: number;
  finishedAt?: number;
  etaSeconds?: number;
  error?: string;
  uploadId?: string;
  key?: string;
  file: File;
}

type Listener = () => void;

const tasks = new Map<string, GalleryUploadTask>();
const listeners = new Set<Listener>();
const abortControllers = new Map<string, AbortController>();

let cache: GalleryUploadTask[] = [];

function notify() {
  cache = Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
  listeners.forEach((listener) => listener());
}

function setTask(id: string, patch: Partial<GalleryUploadTask>) {
  const current = tasks.get(id);
  if (!current) return;
  tasks.set(id, { ...current, ...patch });
  notify();
}

function computeEtaSeconds(startedAt: number, uploadedBytes: number, totalBytes: number) {
  if (uploadedBytes <= 0 || totalBytes <= uploadedBytes) return 0;
  const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
  const speed = uploadedBytes / elapsedSec;
  if (!Number.isFinite(speed) || speed <= 0) return undefined;
  return Math.max(0, Math.round((totalBytes - uploadedBytes) / speed));
}

async function uploadOne(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  const controller = new AbortController();
  abortControllers.set(taskId, controller);
  const { signal } = controller;

  try {
    setTask(taskId, { status: "uploading", progress: 1, startedAt: Date.now() });
    const init = await initGalleryUpload({
      fileName: task.name,
      fileSize: task.size,
      contentType: task.type || "application/octet-stream",
      galleryChannelId: task.channelId,
    });
    setTask(taskId, { uploadId: init.uploadId, key: init.key });

    const parts: Array<{ partNumber: number; etag: string }> = [];
    let uploadedBytes = 0;
    for (let i = 0; i < init.presignedUrls.length; i += MAX_PART_CONCURRENT) {
      if (signal.aborted) throw new Error("Upload aborted");
      const batch = init.presignedUrls.slice(i, i + MAX_PART_CONCURRENT);
      await Promise.all(
        batch.map(async (partInfo) => {
          const start = (partInfo.partNumber - 1) * init.chunkSize;
          const end = Math.min(start + init.chunkSize, task.size);
          const chunk = task.file.slice(start, end);
          const response = await fetch(partInfo.url, {
            method: "PUT",
            body: chunk,
            signal,
          });
          if (!response.ok) throw new Error(`Upload failed on part ${partInfo.partNumber}`);
          const etag = response.headers.get("ETag") || `"part-${partInfo.partNumber}"`;
          parts.push({ partNumber: partInfo.partNumber, etag });
          uploadedBytes += chunk.size;
          const progress = Math.min(95, Math.max(1, Math.round((uploadedBytes / task.size) * 95)));
          const etaSeconds = computeEtaSeconds(task.startedAt, uploadedBytes, task.size);
          setTask(taskId, { uploadedBytes, progress, etaSeconds });
        })
      );
    }

    parts.sort((a, b) => a.partNumber - b.partNumber);
    await completeGalleryUpload({
      uploadId: init.uploadId,
      key: init.key,
      parts,
      galleryChannelId: task.channelId,
      albumId: task.albumId || null,
      fileName: task.name,
      fileSize: task.size,
      contentType: task.type || "application/octet-stream",
    });

    setTask(taskId, {
      status: "completed",
      progress: 100,
      uploadedBytes: task.size,
      etaSeconds: 0,
      finishedAt: Date.now(),
    });
  } catch (error: any) {
    const current = tasks.get(taskId);
    if (current?.status === "aborted") return;
    setTask(taskId, {
      status: signal.aborted ? "aborted" : "failed",
      error: error?.message || "Upload failed",
      finishedAt: Date.now(),
    });
  } finally {
    abortControllers.delete(taskId);
  }
}

async function runQueue(ids: string[]) {
  const queue = [...ids];
  const running = new Set<Promise<void>>();

  const launch = () => {
    if (queue.length === 0) return;
    const id = queue.shift()!;
    const promise = uploadOne(id).finally(() => {
      running.delete(promise);
      launch();
    });
    running.add(promise);
  };

  while (running.size < MAX_FILE_CONCURRENT && queue.length > 0) launch();
  await Promise.all(Array.from(running));
}

export function subscribeGalleryUploads(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGalleryUploadTasks() {
  return cache;
}

export async function startGalleryUploadBatch(channelId: string, files: File[], albumId?: string) {
  if (!channelId) throw new Error("No channel selected");
  const accepted = files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
  const limited = accepted.slice(0, MAX_FILES_PER_BATCH);
  const ids: string[] = [];
  const now = Date.now();

  for (const file of limited) {
    const id = `gallery_${now}_${Math.random().toString(36).slice(2)}`;
    tasks.set(id, {
      id,
      channelId,
      albumId,
      file,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      status: "queued",
      progress: 0,
      uploadedBytes: 0,
      startedAt: Date.now(),
    });
    ids.push(id);
  }
  notify();
  await runQueue(ids);
  return { queued: limited.length, skipped: accepted.length - limited.length };
}

export async function cancelGalleryUpload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  const controller = abortControllers.get(taskId);
  if (controller) controller.abort();
  abortControllers.delete(taskId);
  setTask(taskId, { status: "aborted", error: "Upload cancelled", finishedAt: Date.now() });

  if (task.uploadId && task.key) {
    try {
      await abortUpload(task.uploadId, task.key);
    } catch {
      // no-op
    }
  }
}

export function dismissGalleryUpload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  if (task.status === "uploading" || task.status === "queued") return;
  tasks.delete(taskId);
  notify();
}

export function clearFinishedGalleryUploads() {
  for (const [id, task] of tasks.entries()) {
    if (task.status === "completed" || task.status === "failed" || task.status === "aborted") {
      tasks.delete(id);
    }
  }
  notify();
}
