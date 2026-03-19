export type MediaType = "PHOTO" | "VIDEO";

export interface MediaGps {
  latitude: number;
  longitude: number;
  altitude?: number;
  direction?: number;
}

export interface MediaMetadata {
  // Common
  width?: number | null;
  height?: number | null;
  gps?: MediaGps | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  software?: string | null;

  // Photo-specific
  format?: string | null;
  colorSpace?: string | null;
  density?: number | null;
  hasAlpha?: boolean;
  dateTaken?: string | null;
  lens?: string | null;
  aperture?: string | null;
  shutterSpeed?: string | null;
  iso?: number | null;
  focalLength?: string | null;
  flash?: string | null;
  orientation?: number | null;

  // Video-specific
  codec?: string | null;
  codecLong?: string | null;
  frameRate?: number | null;
  bitrate?: number | null;
  duration?: number | null;
  audioCodec?: string | null;
  audioSampleRate?: number | null;
  audioChannels?: number | null;
  dateCreated?: string | null;
}

export interface GalleryMedia {
  id: string;
  channelId: string;
  albumId: string | null;
  type: MediaType;
  fileName: string;
  fileSize: string | number;
  mimeType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  r2Key: string;
  r2Url: string;
  thumbnailR2Key: string | null;
  thumbnailR2Url: string | null;
  metadata: MediaMetadata | null;
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
  album?: { id: string; name: string } | null;
}

export interface GalleryAlbum {
  id: string;
  channelId: string;
  name: string;
  description: string | null;
  coverMediaId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  coverMedia?: { id: string; r2Url: string; thumbnailR2Url: string | null; type: MediaType } | null;
  _count?: { media: number };
}

export interface GalleryMediaListResponse {
  items: GalleryMedia[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GalleryMediaFilters {
  page?: number;
  pageSize?: number;
  type?: "all" | MediaType;
  albumId?: string;
  q?: string;
  sortBy?: "createdAt" | "fileName" | "fileSize";
  sortOrder?: "asc" | "desc";
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listGalleryMedia(channelId: string, filters: GalleryMediaFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.albumId) params.set("albumId", filters.albumId);
  if (filters.q) params.set("q", filters.q);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  const query = params.toString();
  return request<GalleryMediaListResponse>(`/api/gallery/${channelId}${query ? `?${query}` : ""}`);
}

export async function getGalleryMedia(channelId: string, mediaId: string) {
  return request<GalleryMedia>(`/api/gallery/${channelId}/${mediaId}`);
}

export async function updateGalleryMedia(
  channelId: string,
  mediaId: string,
  payload: { fileName?: string; albumId?: string | null }
) {
  return request<GalleryMedia>(`/api/gallery/${channelId}/${mediaId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteGalleryMedia(channelId: string, mediaId: string) {
  return request<{ ok: boolean }>(`/api/gallery/${channelId}/${mediaId}`, { method: "DELETE" });
}

export async function bulkDeleteGalleryMedia(channelId: string, mediaIds: string[]) {
  return request<{ ok: boolean; deleted: number }>(`/api/gallery/${channelId}/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });
}

export async function getGalleryDownloadUrl(channelId: string, mediaId: string) {
  return request<{ url: string }>(`/api/gallery/${channelId}/${mediaId}/download`);
}

export async function listGalleryAlbums(channelId: string) {
  return request<GalleryAlbum[]>(`/api/gallery/${channelId}/albums`);
}

export async function createGalleryAlbum(channelId: string, payload: { name: string; description?: string }) {
  return request<GalleryAlbum>(`/api/gallery/${channelId}/albums`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getGalleryAlbum(channelId: string, albumId: string) {
  return request<GalleryAlbum & { media: GalleryMedia[] }>(`/api/gallery/${channelId}/albums/${albumId}`);
}

export async function updateGalleryAlbum(
  channelId: string,
  albumId: string,
  payload: { name?: string; description?: string | null; coverMediaId?: string | null }
) {
  return request<GalleryAlbum>(`/api/gallery/${channelId}/albums/${albumId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteGalleryAlbum(channelId: string, albumId: string) {
  return request<{ ok: boolean }>(`/api/gallery/${channelId}/albums/${albumId}`, { method: "DELETE" });
}

export async function addMediaToAlbum(channelId: string, albumId: string, mediaIds: string[]) {
  return request<{ ok: boolean; updated: number }>(`/api/gallery/${channelId}/albums/${albumId}/add`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });
}

export async function removeMediaFromAlbum(channelId: string, albumId: string, mediaIds: string[]) {
  return request<{ ok: boolean; updated: number }>(`/api/gallery/${channelId}/albums/${albumId}/remove`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });
}

