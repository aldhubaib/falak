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
import {
  cancelGalleryUpload,
  clearFinishedGalleryUploads,
  dismissGalleryUpload,
  getGalleryUploadTasks,
  startGalleryUploadBatch,
  subscribeGalleryUploads,
} from "@/lib/galleryUploadManager";


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

export function useMediaUpload(channelId: string | undefined, albumId?: string) {
  const queryClient = useQueryClient();
  const queue = useSyncExternalStore(subscribeGalleryUploads, getGalleryUploadTasks);
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
    async (files: File[]) => {
      if (!channelId) throw new Error("No channel selected");
      return startGalleryUploadBatch(channelId, files, albumId);
    },
    [albumId, channelId]
  );

  const dismissItem = useCallback((id: string) => {
    dismissGalleryUpload(id);
  }, []);

  const clearFinished = useCallback(() => {
    clearFinishedGalleryUploads();
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
    abortUpload: cancelGalleryUpload,
  };
}
