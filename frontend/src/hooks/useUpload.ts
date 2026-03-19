import { useSyncExternalStore, useCallback } from "react";
import { storyQueue, type UploadTask } from "@/lib/uploadQueue";

export type { UploadTask } from "@/lib/uploadQueue";

function getSnapshot() {
  return storyQueue.getSnapshot();
}

export function useUploadTasks(): UploadTask[] {
  return useSyncExternalStore(storyQueue.subscribe, getSnapshot);
}

export function useStoryUpload(storyId: string | undefined) {
  const tasks = useUploadTasks();
  const task = storyId
    ? tasks.find((t) => t.metadata.storyId === storyId)
    : undefined;

  const upload = useCallback(
    (file: File) => {
      if (!storyId) throw new Error("No story ID");
      return storyQueue.addFile(file, { storyId });
    },
    [storyId],
  );

  const abort = useCallback(() => {
    if (task) storyQueue.cancel(task.id);
  }, [task]);

  const dismiss = useCallback(() => {
    if (task) storyQueue.dismiss(task.id);
  }, [task]);

  return { task, upload, abort, dismiss };
}

export function useActiveUploadCount(): number {
  const tasks = useUploadTasks();
  return tasks.filter((t) => t.status === "uploading").length;
}
