/**
 * Low-level multipart upload engine.
 *
 * Features:
 * - Sliding-window concurrency (worker pool) — no idle slots between batches
 * - Direct single-PUT upload for small files (skips multipart overhead)
 * - Resumable uploads via localStorage (survives page refresh / tab close)
 * - Retry with exponential backoff on transient failures
 * - Adaptive chunk size from the backend (25–100 MB based on file size)
 */

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const RESUME_PREFIX = "falak_upload_";

/* ── Types ──────────────────────────────────────────────────────── */

export interface UploadProgress {
  completedParts: number;
  totalParts: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface UploadResult {
  url: string;
  key: string;
  uploadId?: string;
  [k: string]: unknown;
}

export interface UploadFileOptions {
  file: File;
  metadata: Record<string, unknown>;
  maxConcurrent?: number;
  maxRetries?: number;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

interface ResumeState {
  uploadId: string;
  key: string;
  chunkSize: number;
  totalParts: number;
  completedParts: Array<{ partNumber: number; etag: string }>;
  metadata: Record<string, unknown>;
  fileName: string;
  fileSize: number;
  savedAt: number;
}

/* ── HTTP helpers ───────────────────────────────────────────────── */

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function retryPut(
  url: string,
  body: Blob,
  maxRetries: number,
  signal?: AbortSignal,
  contentType?: string,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error("Upload aborted");
    try {
      const headers: Record<string, string> = {};
      if (contentType) headers["Content-Type"] = contentType;
      const res = await fetch(url, { method: "PUT", body, signal, headers });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Upload failed (${res.status})`);
      }
      lastError = new Error(`Upload failed (${res.status})`);
    } catch (e: unknown) {
      const err = e as Error;
      if (err?.name === "AbortError" || signal?.aborted) throw new Error("Upload aborted");
      lastError = err;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Upload failed after retries");
}

/* ── Sliding-window worker pool ─────────────────────────────────── */

async function workerPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let idx = 0;
  let error: Error | null = null;

  async function worker() {
    while (idx < items.length && !error && !signal?.aborted) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        await fn(items[i]);
      } catch (e) {
        if (!error) error = e as Error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  if (error) throw error;
  if (signal?.aborted) throw new Error("Upload aborted");
}

/* ── Resume persistence ─────────────────────────────────────────── */

function resumeKey(meta: Record<string, unknown>, name: string, size: number): string {
  if (meta.storyId) return `${RESUME_PREFIX}story_${meta.storyId}`;
  if (meta.galleryChannelId) return `${RESUME_PREFIX}gallery_${meta.galleryChannelId}_${name}_${size}`;
  return `${RESUME_PREFIX}${name}_${size}`;
}

function saveResume(rk: string, state: ResumeState): void {
  try { localStorage.setItem(rk, JSON.stringify(state)); } catch { /* quota */ }
}

function loadResume(rk: string, name: string, size: number): ResumeState | null {
  try {
    const raw = localStorage.getItem(rk);
    if (!raw) return null;
    const s = JSON.parse(raw) as ResumeState;
    if (s.fileName !== name || s.fileSize !== size) return null;
    if (Date.now() - s.savedAt > RESUME_MAX_AGE_MS) { localStorage.removeItem(rk); return null; }
    return s;
  } catch { return null; }
}

function clearResume(rk: string): void {
  try { localStorage.removeItem(rk); } catch { /* no-op */ }
}

/* ── Main upload function ───────────────────────────────────────── */

export async function uploadFile(options: UploadFileOptions): Promise<UploadResult> {
  const {
    file, metadata,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    maxRetries = DEFAULT_MAX_RETRIES,
    onProgress, signal,
  } = options;

  const contentType = file.type || (metadata.contentType as string) || "application/octet-stream";
  const rk = resumeKey(metadata, file.name, file.size);
  const saved = loadResume(rk, file.name, file.size);

  let uploadId: string | undefined;
  let key: string;
  let chunkSize: number;
  let totalParts: number;
  let presignedUrls: Array<{ partNumber: number; url: string }>;
  let existingParts: Array<{ partNumber: number; etag: string }> = [];

  if (saved && saved.completedParts.length > 0 && saved.completedParts.length < saved.totalParts) {
    /* ── Resume an interrupted multipart upload ──────────────── */
    uploadId = saved.uploadId;
    key = saved.key;
    chunkSize = saved.chunkSize;
    totalParts = saved.totalParts;
    existingParts = saved.completedParts;

    const done = new Set(existingParts.map((p) => p.partNumber));
    const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));

    try {
      const r = await fetchJson<{ presignedUrls: Array<{ partNumber: number; url: string }> }>(
        "/api/upload/resume",
        { method: "POST", body: JSON.stringify({ uploadId, key, partNumbers: remaining }), signal },
      );
      presignedUrls = r.presignedUrls;
    } catch {
      clearResume(rk);
      return uploadFile(options);
    }
  } else {
    /* ── Fresh upload ────────────────────────────────────────── */
    clearResume(rk);

    const init = await fetchJson<{
      mode?: "direct" | "multipart";
      uploadId?: string;
      key: string;
      chunkSize: number;
      totalParts: number;
      contentType?: string;
      presignedUrl?: string;
      presignedUrls?: Array<{ partNumber: number; url: string }>;
    }>("/api/upload/init", {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType, ...metadata }),
      signal,
    });

    key = init.key;

    /* ── Direct single-PUT for small files ───────────────────── */
    if (init.mode === "direct" && init.presignedUrl) {
      onProgress?.({ completedParts: 0, totalParts: 1, bytesUploaded: 0, totalBytes: file.size });

      await retryPut(init.presignedUrl, file, maxRetries, signal, init.contentType || contentType);

      onProgress?.({ completedParts: 1, totalParts: 1, bytesUploaded: file.size, totalBytes: file.size });

      const result = await fetchJson<UploadResult>("/api/upload/complete", {
        method: "POST",
        body: JSON.stringify({ mode: "direct", key, fileName: file.name, fileSize: file.size, contentType, ...metadata }),
        signal,
      });
      return { ...result, key, url: result.url };
    }

    /* ── Multipart init ──────────────────────────────────────── */
    uploadId = init.uploadId;
    chunkSize = init.chunkSize;
    totalParts = init.totalParts;
    presignedUrls = init.presignedUrls ?? [];

    saveResume(rk, {
      uploadId: uploadId!, key, chunkSize, totalParts,
      completedParts: [], metadata, fileName: file.name, fileSize: file.size, savedAt: Date.now(),
    });
  }

  /* ── Upload parts via sliding-window worker pool ────────────── */

  const allParts: Array<{ partNumber: number; etag: string }> = [...existingParts];
  let bytesUploaded = existingParts.reduce((sum, p) => {
    const s = (p.partNumber - 1) * chunkSize;
    return sum + Math.min(chunkSize, file.size - s);
  }, 0);

  onProgress?.({ completedParts: allParts.length, totalParts, bytesUploaded, totalBytes: file.size });

  await workerPool(
    presignedUrls,
    maxConcurrent,
    async (partInfo) => {
      const start = (partInfo.partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const res = await retryPut(partInfo.url, chunk, maxRetries, signal);

      const etag = res.headers.get("ETag") || `"part-${partInfo.partNumber}"`;
      allParts.push({ partNumber: partInfo.partNumber, etag });
      bytesUploaded += end - start;

      onProgress?.({ completedParts: allParts.length, totalParts, bytesUploaded, totalBytes: file.size });

      saveResume(rk, {
        uploadId: uploadId!, key, chunkSize, totalParts,
        completedParts: allParts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
        metadata, fileName: file.name, fileSize: file.size, savedAt: Date.now(),
      });
    },
    signal,
  );

  if (signal?.aborted) throw new Error("Upload aborted");

  /* ── Complete ───────────────────────────────────────────────── */

  allParts.sort((a, b) => a.partNumber - b.partNumber);

  const result = await fetchJson<UploadResult>("/api/upload/complete", {
    method: "POST",
    body: JSON.stringify({ uploadId, key, parts: allParts, fileName: file.name, fileSize: file.size, contentType, ...metadata }),
    signal,
  });

  clearResume(rk);
  return { ...result, uploadId, key, url: result.url };
}

/* ── Abort + cleanup ────────────────────────────────────────────── */

export async function abortRemoteUpload(uploadId: string, key: string): Promise<void> {
  try {
    await fetchJson("/api/upload/abort", {
      method: "POST",
      body: JSON.stringify({ uploadId, key }),
    });
  } catch { /* best-effort */ }
}

export function clearResumeState(metadata: Record<string, unknown>, fileName: string, fileSize: number): void {
  clearResume(resumeKey(metadata, fileName, fileSize));
}
