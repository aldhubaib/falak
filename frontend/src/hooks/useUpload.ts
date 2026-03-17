import { useSyncExternalStore, useCallback } from "react";
import {
  subscribe,
  getTasks,
  getTaskByStoryId,
  getActiveCount,
  startUpload,
  abortUpload,
  removeTask,
  type UploadTask,
} from "@/lib/uploadManager";

function getSnapshot() {
  return getTasks();
}

export function useUploadTasks(): UploadTask[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useStoryUpload(storyId: string | undefined) {
  const tasks = useUploadTasks();
  const task = storyId
    ? tasks.find((t) => t.storyId === storyId)
    : undefined;

  const upload = useCallback(
    async (file: File) => {
      if (!storyId) throw new Error("No story ID");
      return startUpload(storyId, file);
    },
    [storyId]
  );

  const abort = useCallback(() => {
    if (task) abortUpload(task.id);
  }, [task]);

  const dismiss = useCallback(() => {
    if (task) removeTask(task.id);
  }, [task]);

  return { task, upload, abort, dismiss };
}

export function useActiveUploadCount(): number {
  const tasks = useUploadTasks();
  return tasks.filter((t) => t.status === "uploading").length;
}
