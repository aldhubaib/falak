import { useRef, useState, useCallback } from "react";
import { useStoryUpload } from "@/hooks/useUpload";
import { Upload, X, CheckCircle2, AlertCircle, Film, Loader2 } from "lucide-react";

interface VideoUploadProps {
  storyId: string | undefined;
  videoR2Url?: string;
  videoFileName?: string;
  videoFileSize?: number;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

export function VideoUpload({
  storyId,
  videoR2Url,
  videoFileName,
  videoFileSize,
  readOnly,
}: VideoUploadProps) {
  const { task, upload, abort, dismiss } = useStoryUpload(storyId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
        return;
      }
      upload(file).catch(() => {});
    },
    [upload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const isUploading = task?.status === "uploading";
  const isComplete = task?.status === "completed";
  const isFailed = task?.status === "failed";
  const hasVideo = !!videoR2Url || isComplete;

  // Uploading state
  if (isUploading && task) {
    return (
      <div className="rounded-xl bg-background border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue" />
            <span className="text-[13px] font-medium">Uploading video…</span>
          </div>
          <button
            onClick={abort}
            className="flex items-center gap-1 text-[11px] text-dim hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-dim font-mono">
            <span className="truncate max-w-[200px]">{task.file.name}</span>
            <span>{formatBytes(task.file.size)}</span>
          </div>
          <div className="relative h-2 bg-elevated rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-blue rounded-full transition-all duration-300 ease-out"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-dim font-mono">
            <span>
              Part {task.completedParts}/{task.totalParts}
            </span>
            <span>{task.progress}%</span>
          </div>
        </div>
        <p className="text-[11px] text-dim">
          You can navigate away — upload continues in background.
        </p>
      </div>
    );
  }

  // Failed state
  if (isFailed && task) {
    return (
      <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-[13px] font-medium text-red-400">Upload failed</span>
          </div>
          <button
            onClick={dismiss}
            className="p-1 text-dim hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[12px] text-dim">{task.error}</p>
        {!readOnly && (
          <button
            onClick={() => {
              dismiss();
              handleFile(task.file);
            }}
            className="text-[12px] text-blue hover:text-blue/80 font-medium transition-colors"
          >
            Retry upload
          </button>
        )}
      </div>
    );
  }

  // Already has video
  if (hasVideo) {
    const url = isComplete ? task?.videoUrl : videoR2Url;
    const name = isComplete ? task?.file.name : videoFileName;
    const size = isComplete ? task?.file.size : videoFileSize;

    return (
      <div className="rounded-xl bg-background border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-[13px] font-medium">Video uploaded</span>
          </div>
          {!readOnly && (
            <button
              onClick={() => {
                if (isComplete) dismiss();
                fileInputRef.current?.click();
              }}
              className="text-[11px] text-blue hover:text-blue/80 font-medium transition-colors"
            >
              Replace
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-elevated px-4 py-3">
          <Film className="w-5 h-5 text-dim shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-mono truncate">{name || "Video file"}</div>
            {size && <div className="text-[10px] text-dim font-mono">{formatBytes(size)}</div>}
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue hover:text-blue/80 shrink-0"
            >
              Open
            </a>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // Empty state — drop zone
  if (readOnly) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors
        ${dragOver ? "border-blue bg-blue/5" : "border-border hover:border-blue/40 hover:bg-blue/5"}
      `}
    >
      <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center">
        <Upload className="w-5 h-5 text-dim" />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium">Upload video</p>
        <p className="text-[11px] text-dim mt-1">
          Drag & drop or click to select — MP4, WebM, MOV
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
