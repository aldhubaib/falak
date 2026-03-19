import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  abortUpload,
  addMediaToAlbum,
  bulkDeleteGalleryMedia,
  completeGalleryUpload,
  createGalleryAlbum,
  deleteGalleryAlbum,
  deleteGalleryMedia,
  getGalleryAlbum,
  getGalleryDownloadUrl,
  initGalleryUpload,
  listGalleryAlbums,
  listGalleryMedia,
  removeMediaFromAlbum,
  type GalleryMediaFilters,
  updateGalleryAlbum,
  updateGalleryMedia,
} from "@/lib/gallery-api";

const MAX_CONCURRENT = 3;

export function useGalleryMedia(channelId: string | undefined, filters: GalleryMediaFilters) {
  return useQuery({
    queryKey: ["gallery-media", channelId, filters],
    queryFn: () => listGalleryMedia(channelId!, filters),
    enabled: Boolean(channelId),
  });
}

export function useGalleryAlbums(channelId: string | undefined) {
  return useQuery({
    queryKey: ["gallery-albums", channelId],
    queryFn: () => listGalleryAlbums(channelId!),
    enabled: Boolean(channelId),
  });
}

export function useGalleryAlbum(channelId: string | undefined, albumId: string | undefined) {
  return useQuery({
    queryKey: ["gallery-album", channelId, albumId],
    queryFn: () => getGalleryAlbum(channelId!, albumId!),
    enabled: Boolean(channelId && albumId),
  });
}

export function useGalleryActions(channelId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gallery-media", channelId] }),
      queryClient.invalidateQueries({ queryKey: ["gallery-albums", channelId] }),
      queryClient.invalidateQueries({ queryKey: ["gallery-album", channelId] }),
    ]);
  }, [channelId, queryClient]);

  const deleteMedia = useMutation({
    mutationFn: (mediaId: string) => deleteGalleryMedia(channelId!, mediaId),
    onSuccess: invalidate,
  });
  const bulkDelete = useMutation({
    mutationFn: (mediaIds: string[]) => bulkDeleteGalleryMedia(channelId!, mediaIds),
    onSuccess: invalidate,
  });
  const renameOrMove = useMutation({
    mutationFn: ({ mediaId, fileName, albumId }: { mediaId: string; fileName?: string; albumId?: string | null }) =>
      updateGalleryMedia(channelId!, mediaId, { fileName, albumId }),
    onSuccess: invalidate,
  });
  const createAlbum = useMutation({
    mutationFn: (payload: { name: string; description?: string }) => createGalleryAlbum(channelId!, payload),
    onSuccess: invalidate,
  });
  const patchAlbum = useMutation({
    mutationFn: ({ albumId, ...payload }: { albumId: string; name?: string; description?: string | null; coverMediaId?: string | null }) =>
      updateGalleryAlbum(channelId!, albumId, payload),
    onSuccess: invalidate,
  });
  const removeAlbum = useMutation({
    mutationFn: (albumId: string) => deleteGalleryAlbum(channelId!, albumId),
    onSuccess: invalidate,
  });
  const addToAlbum = useMutation({
    mutationFn: ({ albumId, mediaIds }: { albumId: string; mediaIds: string[] }) => addMediaToAlbum(channelId!, albumId, mediaIds),
    onSuccess: invalidate,
  });
  const removeFromAlbum = useMutation({
    mutationFn: ({ albumId, mediaIds }: { albumId: string; mediaIds: string[] }) => removeMediaFromAlbum(channelId!, albumId, mediaIds),
    onSuccess: invalidate,
  });

  return {
    deleteMedia,
    bulkDelete,
    renameOrMove,
    createAlbum,
    patchAlbum,
    removeAlbum,
    addToAlbum,
    removeFromAlbum,
    refresh: invalidate,
  };
}

export interface UploadQueueItem {
  id: string;
  name: string;
  progress: number;
  status: "queued" | "uploading" | "completed" | "failed" | "aborted";
  error?: string;
}

export function useMediaUpload(channelId: string | undefined, albumId?: string) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);

  const activeCount = useMemo(
    () => queue.filter((item) => item.status === "uploading" || item.status === "queued").length,
    [queue]
  );

  const setItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!channelId) throw new Error("No channel selected");
      const entries = files.map((file) => ({
        id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: file.name,
        progress: 0,
        status: "queued" as const,
        file,
      }));
      setQueue((prev) => [...entries.map(({ file: _f, ...rest }) => rest), ...prev]);

      const executeOne = async (entry: (typeof entries)[number]) => {
        const { id, file } = entry;
        try {
          setItem(id, { status: "uploading", progress: 1 });
          const init = await initGalleryUpload({
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || "application/octet-stream",
            galleryChannelId: channelId,
          });

          const parts: Array<{ partNumber: number; etag: string }> = [];
          for (let i = 0; i < init.presignedUrls.length; i += MAX_CONCURRENT) {
            const batch = init.presignedUrls.slice(i, i + MAX_CONCURRENT);
            await Promise.all(
              batch.map(async (partInfo) => {
                const start = (partInfo.partNumber - 1) * init.chunkSize;
                const end = Math.min(start + init.chunkSize, file.size);
                const chunk = file.slice(start, end);
                const response = await fetch(partInfo.url, { method: "PUT", body: chunk });
                if (!response.ok) throw new Error(`Upload failed on part ${partInfo.partNumber}`);
                const etag = response.headers.get("ETag") || `"part-${partInfo.partNumber}"`;
                parts.push({ partNumber: partInfo.partNumber, etag });
                const uploaded = parts.length;
                const progress = Math.round((uploaded / init.totalParts) * 95);
                setItem(id, { progress: Math.max(progress, 5) });
              })
            );
          }

          parts.sort((a, b) => a.partNumber - b.partNumber);
          await completeGalleryUpload({
            uploadId: init.uploadId,
            key: init.key,
            parts,
            galleryChannelId: channelId,
            albumId: albumId || null,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || "application/octet-stream",
          });
          setItem(id, { progress: 100, status: "completed" });
        } catch (e: any) {
          setItem(id, { status: "failed", error: e?.message || "Upload failed" });
        }
      };

      await Promise.all(entries.map((entry) => executeOne(entry)));
      await queryClient.invalidateQueries({ queryKey: ["gallery-media", channelId] });
      await queryClient.invalidateQueries({ queryKey: ["gallery-albums", channelId] });
    },
    [albumId, channelId, queryClient, setItem]
  );

  const dismissItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === "uploading" || item.status === "queued"));
  }, []);

  const getDownloadUrl = useCallback(
    async (mediaId: string) => {
      if (!channelId) throw new Error("No channel selected");
      return getGalleryDownloadUrl(channelId, mediaId);
    },
    [channelId]
  );

  return {
    queue,
    activeCount,
    uploadFiles,
    dismissItem,
    clearFinished,
    getDownloadUrl,
    abortUpload,
  };
}
