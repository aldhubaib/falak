import { useUploadTasks } from "@/hooks/useUpload";
import { storyQueue, type UploadTask } from "@/lib/uploadQueue";
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UploadItem({ task }: { task: UploadTask }) {
  const isUploading = task.status === "uploading";
  const isComplete = task.status === "completed";
  const isFailed = task.status === "failed";

  return (
    <div className="flex items-center gap-3 min-w-0">
      {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
      {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
      {isFailed && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-mono truncate max-w-[160px]">{task.file.name}</div>
        {isUploading && (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1 bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground font-mono shrink-0">{task.progress}%</span>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          if (isUploading) storyQueue.cancel(task.id);
          else storyQueue.dismiss(task.id);
        }}
        className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function UploadIndicator() {
  const tasks = useUploadTasks();
  const active = tasks.filter(
    (t) => t.status === "uploading" || t.status === "failed"
  );
  const recentCompleted = tasks.filter(
    (t) => t.status === "completed"
  );

  const visible = [...active, ...recentCompleted.slice(0, 2)];
  if (visible.length === 0) return null;

  const uploadingCount = active.filter((t) => t.status === "uploading").length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Upload className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium">
          {uploadingCount > 0
            ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? "s" : ""}…`
            : "Uploads"}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
        {visible.map((task) => (
          <UploadItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
