import { useRef, useState, useCallback, useEffect } from "react";
import { useStoryUpload } from "@/hooks/useUpload";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Film,
  Loader2,
  Play,
  Clock,
  HardDrive,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

interface VideoUploadProps {
  storyId: string | undefined;
  videoR2Key?: string;
  videoFileName?: string;
  videoFileSize?: number;
  readOnly?: boolean;
  required?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getExtension(name?: string): string {
  if (!name) return "VIDEO";
  const ext = name.split(".").pop()?.toUpperCase();
  return ext || "VIDEO";
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
  videoR2Key,
  videoFileName,
  videoFileSize,
  readOnly,
  required,
}: VideoUploadProps) {
  const { task, upload, abort, dismiss } = useStoryUpload(storyId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoR2Key) { setSignedUrl(null); return; }
    let cancelled = false;
    fetch(`/api/upload/signed-url/${videoR2Key}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.url) setSignedUrl(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoR2Key]);

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
  const hasVideo = !!videoR2Key || isComplete;

  const hiddenInput = (
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
  );

  // ── Uploading ─────────────────────────────────────────────────
  if (isUploading && task) {
    const elapsed = (Date.now() - task.startedAt) / 1000;
    const speed = elapsed > 0 ? task.bytesUploaded / elapsed : 0;
    const remaining = speed > 0 ? (task.file.size - task.bytesUploaded) / speed : 0;
    const etaText = remaining > 0
      ? remaining >= 3600
        ? `~${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`
        : remaining >= 60
          ? `~${Math.floor(remaining / 60)}m ${Math.floor(remaining % 60)}s`
          : `~${Math.floor(remaining)}s`
      : "estimating…";
    const speedText = speed > 0
      ? speed >= 1024 * 1024
        ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
        : `${(speed / 1024).toFixed(0)} KB/s`
      : "";

    return (
      <div className="rounded-xl bg-background border border-border overflow-hidden">
        <div className="flex max-sm:flex-col">
          {/* Thumbnail placeholder */}
          <div className="w-44 max-sm:w-full max-sm:h-28 bg-elevated shrink-0 flex items-center justify-center relative">
            <div className="flex flex-col items-center gap-1.5">
              <Loader2 className="w-6 h-6 animate-spin text-blue" />
              <span className="text-[9px] font-mono text-dim uppercase tracking-widest">Uploading</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface">
              <div
                className="h-full bg-blue transition-all duration-300 ease-out"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{task.file.name}</p>
                <p className="text-[11px] text-dim font-mono mt-0.5">
                  {formatBytes(task.bytesUploaded)} / {formatBytes(task.file.size)}
                </p>
              </div>
              <button
                onClick={abort}
                className="shrink-0 p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="relative h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-blue rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-dim font-mono">
                  <span>Part {task.completedParts}/{task.totalParts}</span>
                  {speedText && (
                    <>
                      <span className="text-border">·</span>
                      <span>{speedText}</span>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-dim font-mono">{etaText}</span>
              </div>
            </div>

            <p className="text-[10px] text-dim">
              Navigate away freely — upload continues in background.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────
  if (isFailed && task) {
    return (
      <div className="rounded-xl bg-background border border-red-500/20 overflow-hidden">
        <div className="flex max-sm:flex-col">
          <div className="w-44 max-sm:w-full max-sm:h-28 bg-red-500/5 shrink-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1.5">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <span className="text-[9px] font-mono text-red-400 uppercase tracking-widest">Failed</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-red-400">Upload failed</p>
                <p className="text-[11px] text-dim mt-0.5">{task.error}</p>
              </div>
              <button
                onClick={dismiss}
                className="shrink-0 p-1.5 rounded-lg text-dim hover:text-foreground hover:bg-elevated transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {!readOnly && (
              <button
                onClick={() => { dismiss(); handleFile(task.file); }}
                className="self-start flex items-center gap-1.5 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry upload
              </button>
            )}
          </div>
        </div>
        {hiddenInput}
      </div>
    );
  }

  // ── Has video (thumbnail + metadata) ──────────────────────────
  if (hasVideo) {
    const url = isComplete ? task?.videoUrl : signedUrl;
    const name = isComplete ? task?.file.name : videoFileName;
    const size = isComplete ? task?.file.size : videoFileSize;
    const ext = getExtension(name);

    return (
      <div className="rounded-xl bg-background border border-border overflow-hidden">
        <div className="flex max-sm:flex-col">
          {/* Thumbnail / preview */}
          <div className="w-44 max-sm:w-full max-sm:h-32 bg-elevated shrink-0 flex items-center justify-center relative group">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-surface/80 flex items-center justify-center">
                <Play className="w-4 h-4 text-foreground ml-0.5" />
              </div>
              <span className="text-[9px] font-mono text-dim uppercase tracking-widest">{ext}</span>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            <div className="absolute top-2 left-2">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/15 text-success">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span className="text-[8px] font-mono uppercase tracking-wider">Uploaded</span>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{name || "Video file"}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {size && (
                    <div className="flex items-center gap-1 text-[10px] text-dim font-mono">
                      <HardDrive className="w-3 h-3" />
                      {formatBytes(size)}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-dim font-mono">
                    <Film className="w-3 h-3" />
                    {ext}
                  </div>
                </div>
              </div>
              {!readOnly && (
                <button
                  onClick={() => {
                    if (isComplete) dismiss();
                    fileInputRef.current?.click();
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-blue font-medium border border-blue/20 hover:bg-blue/10 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Replace
                </button>
              )}
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start flex items-center gap-1.5 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open video
              </a>
            )}
          </div>
        </div>
        {hiddenInput}
      </div>
    );
  }

  // ── Empty state — drop zone ───────────────────────────────────
  if (readOnly) return null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        rounded-xl border border-dashed overflow-hidden cursor-pointer transition-all
        ${dragOver
          ? "border-blue bg-blue/5 shadow-[inset_0_0_20px_rgba(56,132,244,0.05)]"
          : "border-border hover:border-blue/30 hover:bg-elevated/50"
        }
      `}
    >
      <div className="flex max-sm:flex-col">
        {/* Icon area */}
        <div className={`
          w-44 max-sm:w-full max-sm:h-24 shrink-0 flex items-center justify-center transition-colors
          ${dragOver ? "bg-blue/10" : "bg-elevated/50"}
        `}>
          <div className="flex flex-col items-center gap-2">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center transition-colors
              ${dragOver ? "bg-blue/20" : "bg-surface"}
            `}>
              <Upload className={`w-5 h-5 transition-colors ${dragOver ? "text-blue" : "text-dim"}`} />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 p-4 flex flex-col justify-center gap-1">
          <p className="text-[13px] font-medium">
            {dragOver ? "Drop to upload" : "Upload video"}
            {required && !dragOver && <span className="text-red-400 ml-1">*</span>}
          </p>
          <p className="text-[11px] text-dim">
            Drag & drop or click to select — MP4, WebM, MOV, AVI, MKV
          </p>
          {required && (
            <p className="text-[10px] text-orange/70 mt-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Required before moving to next stage
            </p>
          )}
        </div>
      </div>
      {hiddenInput}
    </div>
  );
}
