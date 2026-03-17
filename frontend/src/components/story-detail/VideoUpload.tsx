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
  HardDrive,
  RefreshCw,
  Clock,
  Calendar,
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
      <div className="rounded-xl overflow-hidden border border-border flex max-md:flex-col bg-background">
        {/* Left — animated upload area */}
        <div className="relative shrink-0 p-3 w-[200px] max-md:w-full">
          <div className="w-full aspect-video rounded-xl bg-elevated flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-blue" />
              <span className="text-[10px] font-mono text-dim uppercase tracking-wider">
                {Math.round(task.progress)}%
              </span>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 right-3 h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-blue rounded-full transition-all duration-300 ease-out"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        {/* Right — info */}
        <div className="flex-1 flex flex-col gap-3 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold tracking-tight truncate" dir="rtl" style={{ textAlign: "right" }}>
              {task.file.name}
            </p>
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
            <div className="flex items-center justify-between text-[10px] text-dim font-mono">
              <span>{formatBytes(task.bytesUploaded)} / {formatBytes(task.file.size)}</span>
              <span>{etaText}</span>
            </div>
          </div>

          {/* Metadata row — matches VideoDetail STATUS / SPEED / ETA */}
          <div className="flex items-center gap-0 mt-auto">
            <div className="pr-3 py-1">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 text-blue animate-spin" />
                <span className="text-[12px] text-sensor font-medium">Uploading</span>
              </div>
            </div>
            <span className="w-px h-8 bg-border" />
            <div className="px-3 py-1">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Speed</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-sensor font-medium">{speedText || "—"}</span>
              </div>
            </div>
            <span className="w-px h-8 bg-border" />
            <div className="px-3 py-1">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Part</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-sensor font-medium">{task.completedParts}/{task.totalParts}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────
  if (isFailed && task) {
    return (
      <div className="rounded-xl overflow-hidden border border-red-500/20 flex max-md:flex-col bg-background">
        {/* Left */}
        <div className="relative shrink-0 p-3 w-[200px] max-md:w-full">
          <div className="w-full aspect-video rounded-xl bg-red-500/5 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="w-7 h-7 text-red-400" />
              <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Failed</span>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 flex flex-col gap-3 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-red-400">Upload failed</p>
              <p className="text-[11px] text-dim mt-0.5">{task.error}</p>
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 p-1.5 rounded-lg text-dim hover:text-foreground hover:bg-elevated transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-0 mt-auto">
            <div className="pr-3 py-1">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-[12px] text-sensor font-medium">Failed</span>
              </div>
            </div>
            {!readOnly && (
              <>
                <span className="w-px h-8 bg-border" />
                <button
                  onClick={() => { dismiss(); handleFile(task.file); }}
                  className="px-3 py-1 flex items-center gap-1.5 text-[12px] text-blue hover:text-blue/80 font-medium transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
        {hiddenInput}
      </div>
    );
  }

  // ── Has video — matches VideoDetail header ────────────────────
  if (hasVideo) {
    const url = isComplete ? task?.videoUrl : signedUrl;
    const name = isComplete ? task?.file.name : videoFileName;
    const size = isComplete ? task?.file.size : videoFileSize;
    const ext = getExtension(name);

    return (
      <div className="rounded-xl overflow-hidden border border-border flex max-md:flex-col bg-background">
        {/* Left — thumbnail / preview */}
        <div className="relative shrink-0 p-3 w-[200px] max-md:w-full">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full aspect-video rounded-xl bg-elevated overflow-hidden group focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <div className="w-full h-full flex items-center justify-center relative">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-surface/80 flex items-center justify-center group-hover:bg-blue/20 transition-colors">
                    <Play className="w-4 h-4 text-foreground ml-0.5 group-hover:text-blue transition-colors" />
                  </div>
                  <span className="text-[9px] font-mono text-dim uppercase tracking-widest">{ext}</span>
                </div>
              </div>
            </a>
          ) : (
            <div className="w-full aspect-video rounded-xl bg-elevated flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-surface/80 flex items-center justify-center">
                  <Play className="w-4 h-4 text-foreground ml-0.5" />
                </div>
                <span className="text-[9px] font-mono text-dim uppercase tracking-widest">{ext}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right — info */}
        <div className="flex-1 flex flex-col gap-4 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold tracking-tight truncate" dir="rtl" style={{ textAlign: "right" }}>
              {name || "Video file"}
            </p>
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

          {/* Metadata row — STATUS / SIZE / FORMAT — matches VideoDetail */}
          <div className="flex items-center gap-0 mt-auto ml-auto">
            <div className="px-3 py-2">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span className="text-[12px] text-sensor font-medium">Uploaded</span>
              </div>
            </div>
            <span className="w-px h-8 bg-border" />
            {size != null && (
              <>
                <div className="px-3 py-2">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Size</div>
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-dim" />
                    <span className="text-[12px] text-sensor font-medium">{formatBytes(size)}</span>
                  </div>
                </div>
                <span className="w-px h-8 bg-border" />
              </>
            )}
            <div className="px-3 py-2">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Format</div>
              <div className="flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-dim" />
                <span className="text-[12px] text-sensor font-medium">{ext}</span>
              </div>
            </div>
          </div>
        </div>
        {hiddenInput}
      </div>
    );
  }

  // ── Empty state — drop zone (same card shape) ─────────────────
  if (readOnly) return null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        rounded-xl overflow-hidden border cursor-pointer transition-all flex max-md:flex-col bg-background
        ${dragOver
          ? "border-blue shadow-[inset_0_0_20px_rgba(56,132,244,0.05)]"
          : "border-dashed border-border hover:border-blue/30"
        }
      `}
    >
      {/* Left — upload icon area */}
      <div className={`
        relative shrink-0 p-3 w-[200px] max-md:w-full transition-colors
      `}>
        <div className={`
          w-full aspect-video rounded-xl flex items-center justify-center transition-colors
          ${dragOver ? "bg-blue/10" : "bg-elevated"}
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
      </div>

      {/* Right — instructions */}
      <div className="flex-1 flex flex-col gap-3 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
        <div>
          <p className="text-base font-semibold tracking-tight">
            {dragOver ? "Drop to upload" : "Upload video"}
            {required && !dragOver && <span className="text-red-400 ml-1">*</span>}
          </p>
          <p className="text-[11px] text-dim mt-1">
            Drag & drop or click to select — MP4, WebM, MOV, AVI, MKV
          </p>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-0 mt-auto">
          <div className="pr-3 py-1">
            <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-dim" />
              <span className="text-[12px] text-sensor font-medium">Pending</span>
            </div>
          </div>
          {required && (
            <>
              <span className="w-px h-8 bg-border" />
              <div className="px-3 py-1">
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Required</div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-orange/70" />
                  <span className="text-[12px] text-orange/70 font-medium">Before next stage</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {hiddenInput}
    </div>
  );
}
