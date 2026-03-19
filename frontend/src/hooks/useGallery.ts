import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMediaToAlbum,
  bulkDeleteGalleryMedia,
  createGalleryAlbum,
  deleteGalleryAlbum,
  deleteGalleryMedia,
  getGalleryAlbum,
  getGalleryDownloadUrl,
  listGalleryAlbums,
  listGalleryMedia,
  removeMediaFromAlbum,
  type GalleryMediaFilters,
  updateGalleryAlbum,
  updateGalleryMedia,
} from "@/lib/gallery-api";
import { galleryQueue } from "@/lib/uploadQueue";


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

const MAX_FILES_PER_BATCH = 100;

export function useMediaUpload(channelId: string | undefined, albumId?: string) {
  const queryClient = useQueryClient();
  const queue = useSyncExternalStore(galleryQueue.subscribe, galleryQueue.getSnapshot);
  const prevCompletedCount = useRef(0);
  const activeCount = queue.filter((item) => item.status === "uploading" || item.status === "queued").length;

  useEffect(() => {
    const completedCount = queue.filter((item) => item.status === "completed").length;
    if (completedCount > prevCompletedCount.current && channelId) {
      void queryClient.invalidateQueries({ queryKey: ["gallery-media", channelId] });
      void queryClient.invalidateQueries({ queryKey: ["gallery-albums", channelId] });
      void queryClient.invalidateQueries({ queryKey: ["gallery-album", channelId] });
    }
    prevCompletedCount.current = completedCount;
  }, [channelId, queryClient, queue]);

  const uploadFiles = useCallback(
    (files: File[]) => {
      if (!channelId) throw new Error("No channel selected");
      const accepted = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
      const limited = accepted.slice(0, MAX_FILES_PER_BATCH);
      galleryQueue.addFiles(limited, { galleryChannelId: channelId, albumId: albumId || null });
      return { queued: limited.length, skipped: accepted.length - limited.length };
    },
    [albumId, channelId],
  );

  const dismissItem = useCallback((id: string) => {
    galleryQueue.dismiss(id);
  }, []);

  const clearFinished = useCallback(() => {
    galleryQueue.clearFinished();
  }, []);

  const getDownloadUrl = useCallback(
    async (mediaId: string) => {
      if (!channelId) throw new Error("No channel selected");
      return getGalleryDownloadUrl(channelId, mediaId);
    },
    [channelId],
  );

  return {
    queue,
    activeCount,
    uploadFiles,
    dismissItem,
    clearFinished,
    getDownloadUrl,
    abortUpload: galleryQueue.cancel,
  };
}
