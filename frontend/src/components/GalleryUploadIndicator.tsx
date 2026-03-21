import { useSyncExternalStore } from "react";
import { CheckCircle2, ImageUp, Loader2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { galleryQueue } from "@/lib/uploadQueue";

function formatEta(seconds?: number) {
  if (seconds === undefined) return "Calculating...";
  if (seconds <= 0) return "Done";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function GalleryUploadIndicator() {
  const tasks = useSyncExternalStore(galleryQueue.subscribe, galleryQueue.getSnapshot);
  const visible = tasks.filter((t) => t.status !== "completed").slice(0, 8);
  const completed = tasks.filter((t) => t.status === "completed").length;

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 rounded-lg border border-border bg-background shadow-2xl">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ImageUp className="w-4 h-4" />
          Gallery uploads ({tasks.length})
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => galleryQueue.clearFinished()}>
          Clear done
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto p-2 space-y-2">
        {visible.map((task) => (
          <div key={task.id} className="rounded-lg border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] truncate">{task.file.name}</div>
              <button
                onClick={() => {
                  if (task.status === "uploading" || task.status === "queued") galleryQueue.cancel(task.id);
                  else galleryQueue.dismiss(task.id);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                x
              </button>
            </div>
            <Progress className="h-2 mt-1.5" value={task.progress} />
            <div className="mt-1 text-[10px] text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                {task.status === "uploading" || task.status === "queued" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {task.status === "failed" ? <XCircle className="w-3 h-3" /> : null}
                {task.status}
              </span>
              <span>{task.progress}% • {formatEta(task.etaSeconds)}</span>
            </div>
          </div>
        ))}
        {completed > 0 ? (
          <div className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
            <CheckCircle2 className="w-3 h-3" />
            {completed} completed upload(s)
          </div>
        ) : null}
      </div>
    </div>
  );
}
