/**
 * Low-level multipart upload engine.
 * Handles: init → chunked part upload (with concurrency + retry) → complete.
 * Consumers use uploadQueue.ts for reactive state management.
 */

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

export interface UploadProgress {
  completedParts: number;
  totalParts: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface UploadResult {
  url: string;
  key: string;
  uploadId: string;
  [k: string]: unknown;
}

export interface UploadFileOptions {
  file: File;
  metadata: Record<string, unknown>;
  maxConcurrent?: number;
  maxRetries?: number;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

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
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error("Upload aborted");
    try {
      const res = await fetch(url, { method: "PUT", body, signal });
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Part upload failed (${res.status})`);
      }
      lastError = new Error(`Part upload failed (${res.status})`);
    } catch (e: unknown) {
      const err = e as Error;
      if (err?.name === "AbortError" || signal?.aborted) throw new Error("Upload aborted");
      lastError = err;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Upload failed after retries");
}

export async function uploadFile(options: UploadFileOptions): Promise<UploadResult> {
  const {
    file,
    metadata,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    maxRetries = DEFAULT_MAX_RETRIES,
    onProgress,
    signal,
  } = options;

  const contentType = file.type || (metadata.contentType as string) || "application/octet-stream";

  // 1. Init multipart upload
  const initRes = await fetchJson<{
    uploadId: string;
    key: string;
    chunkSize: number;
    totalParts: number;
    presignedUrls: Array<{ partNumber: number; url: string }>;
  }>("/api/upload/init", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType, ...metadata }),
    signal,
  });

  const { uploadId, key, chunkSize, totalParts, presignedUrls } = initRes;

  // 2. Upload parts with bounded concurrency + retry
  const parts: Array<{ partNumber: number; etag: string }> = [];
  let bytesUploaded = 0;
  onProgress?.({ completedParts: 0, totalParts, bytesUploaded: 0, totalBytes: file.size });

  for (let i = 0; i < presignedUrls.length; i += maxConcurrent) {
    if (signal?.aborted) throw new Error("Upload aborted");
    const batch = presignedUrls.slice(i, i + maxConcurrent);
    await Promise.all(
      batch.map(async (partInfo) => {
        const start = (partInfo.partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const res = await retryPut(partInfo.url, chunk, maxRetries, signal);

        const etag = res.headers.get("ETag") || `"part-${partInfo.partNumber}"`;
        parts.push({ partNumber: partInfo.partNumber, etag });
        bytesUploaded += end - start;
        onProgress?.({ completedParts: parts.length, totalParts, bytesUploaded, totalBytes: file.size });
      }),
    );
  }

  if (signal?.aborted) throw new Error("Upload aborted");

  // 3. Complete multipart upload
  parts.sort((a, b) => a.partNumber - b.partNumber);
  const result = await fetchJson<UploadResult>("/api/upload/complete", {
    method: "POST",
    body: JSON.stringify({ uploadId, key, parts, fileName: file.name, fileSize: file.size, contentType, ...metadata }),
    signal,
  });

  return { ...result, uploadId, key, url: result.url };
}

export async function abortRemoteUpload(uploadId: string, key: string): Promise<void> {
  try {
    await fetchJson("/api/upload/abort", {
      method: "POST",
      body: JSON.stringify({ uploadId, key }),
    });
  } catch {
    /* best-effort */
  }
}
