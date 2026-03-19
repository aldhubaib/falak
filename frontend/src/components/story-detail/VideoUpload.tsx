import { useRef, useState, useCallback, useEffect } from "react";
import { useStoryUpload } from "@/hooks/useUpload";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  HardDrive,
  RefreshCw,
  Clock,
  Calendar,
  Zap,
} from "lucide-react";

interface VideoUploadProps {
  storyId: string | undefined;
  videoR2Key?: string;
  videoFileName?: string;
  videoFileSize?: number;
  videoFormat?: "short" | "long";
  headline?: string;
  readOnly?: boolean;
  required?: boolean;
  onUploadComplete?: (data: { videoR2Key: string; videoR2Url: string; videoFileName: string; videoFileSize: number }) => void;
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

function TypeIcon({ format, className = "w-3 h-3" }: { format: "short" | "long"; className?: string }) {
  return format === "short"
    ? <Zap className={className} />
    : <Play className={className} />;
}

export function VideoUpload({
  storyId,
  videoR2Key,
  videoFileName,
  videoFileSize,
  videoFormat = "long",
  headline = "",
  readOnly,
  required,
  onUploadComplete,
}: VideoUploadProps) {
  const { task, upload, abort, dismiss } = useStoryUpload(storyId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (task?.status === "completed" && !notifiedRef.current && onUploadComplete && task.key) {
      notifiedRef.current = true;
      onUploadComplete({
        videoR2Key: task.key,
        videoR2Url: task.videoUrl || "",
        videoFileName: task.file.name,
        videoFileSize: task.file.size,
      });
    }
    if (task?.status !== "completed") {
      notifiedRef.current = false;
    }
  }, [task?.status, task?.key, onUploadComplete]);

  const isShort = videoFormat === "short";
  const thumbW = isShort ? "w-[200px] max-md:w-full" : "w-[380px] max-md:w-full";
  const thumbAspect = isShort ? "aspect-[9/16]" : "aspect-video";

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

  /* ── Metadata row (reused across states) ──────────────────────── */
  function MetadataRow({ status, statusIcon, statusColor, extra }: {
    status: string;
    statusIcon: React.ReactNode;
    statusColor?: string;
    extra?: React.ReactNode;
  }) {
    return (
      <div className="flex items-center gap-0 mt-auto ml-auto">
        <div className="px-3 py-2">
          <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex ${statusColor || "text-dim"}`}>{statusIcon}</span>
            <span className="text-[12px] text-sensor font-medium">{status}</span>
          </div>
        </div>
        <span className="w-px h-8 bg-border" />
        <div className="px-3 py-2">
          <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Type</div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${isShort ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"}`}>
              <TypeIcon format={videoFormat} className="w-3 h-3" />
            </span>
          </div>
        </div>
        {extra && (
          <>
            <span className="w-px h-8 bg-border" />
            {extra}
          </>
        )}
      </div>
    );
  }

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
        {/* Thumbnail area — progress animation */}
        <div className={`relative shrink-0 p-3 ${thumbW}`}>
          <div className={`w-full ${thumbAspect} rounded-xl bg-elevated flex items-center justify-center relative overflow-hidden`}>
            <div className="flex flex-col items-center gap-2 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-blue" />
              <span className="text-[11px] font-mono text-dim">{Math.round(task.progress)}%</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-surface">
              <div
                className="h-full bg-blue transition-all duration-300 ease-out"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Info right */}
        <div className="flex-1 flex flex-col gap-3 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight max-lg:text-sm truncate" dir="rtl" style={{ textAlign: "right" }}>
                {headline || task.file.name}
              </h2>
              <div className="flex items-center justify-end gap-3 mt-1.5 text-[11px] text-dim font-mono" dir="rtl">
                <span>{formatBytes(task.bytesUploaded)} / {formatBytes(task.file.size)}</span>
                {speedText && <span>{speedText}</span>}
                <span>{etaText}</span>
              </div>
            </div>
            <button
              onClick={abort}
              className="shrink-0 p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <MetadataRow
            status="Uploading"
            statusIcon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
            statusColor="text-blue"
            extra={
              <div className="px-3 py-2">
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Part</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-sensor font-medium">{task.completedParts}/{task.totalParts}</span>
                </div>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────
  if (isFailed && task) {
    return (
      <div className="rounded-xl overflow-hidden border border-red-500/20 flex max-md:flex-col bg-background">
        <div className={`relative shrink-0 p-3 ${thumbW}`}>
          <div className={`w-full ${thumbAspect} rounded-xl bg-red-500/5 flex items-center justify-center`}>
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <span className="text-[11px] font-mono text-red-400 uppercase tracking-wider">Failed</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-red-400">Upload failed</p>
              <p className="text-[11px] text-dim mt-1">{task.error}</p>
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 p-1.5 rounded-lg text-dim hover:text-foreground hover:bg-elevated transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-0 mt-auto ml-auto">
            <div className="px-3 py-2">
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
                  className="px-3 py-2 flex items-center gap-1.5 text-[12px] text-blue hover:text-blue/80 font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
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

  // ── Has video — mirrors VideoDetail header exactly ────────────
  if (hasVideo) {
    const url = isComplete ? task?.videoUrl : signedUrl;
    const name = isComplete ? task?.file.name : videoFileName;
    const size = isComplete ? task?.file.size : videoFileSize;
    const ext = getExtension(name);

    return (
      <div className="rounded-xl overflow-hidden border border-border flex max-md:flex-col bg-background">
        {/* Thumbnail left — video preview */}
        <div className={`relative shrink-0 p-3 ${thumbW}`}>
          {url ? (
            <div className="block rounded-xl overflow-hidden group relative">
              <video
                src={url}
                className={`w-full ${thumbAspect} object-cover rounded-xl bg-elevated`}
                muted
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  video.currentTime = 1;
                }}
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
              >
                <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </div>
              </a>
              <span className="absolute bottom-4 right-4 text-[9px] font-mono text-white/80 bg-black/50 px-1.5 py-0.5 rounded uppercase tracking-widest">{ext}</span>
            </div>
          ) : (
            <div className={`w-full ${thumbAspect} rounded-xl bg-elevated flex items-center justify-center`}>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-surface/80 flex items-center justify-center">
                  <Play className="w-5 h-5 text-foreground ml-0.5" />
                </div>
                <span className="text-[9px] font-mono text-dim uppercase tracking-widest">{ext}</span>
              </div>
            </div>
          )}
        </div>

        {/* Info right — same layout as VideoDetail */}
        <div className="flex-1 flex flex-col gap-4 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight max-lg:text-sm" dir="rtl" style={{ textAlign: "right" }}>
              {headline || name || "Video"}
            </h2>
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

          {/* Metadata grid — STATUS / SIZE / TYPE */}
          <div className="flex items-center gap-0 mt-auto ml-auto">
            <div className="px-3 py-2">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex text-success"><CheckCircle2 className="w-3.5 h-3.5" /></span>
                <span className="text-[12px] text-sensor font-medium">Uploaded</span>
              </div>
            </div>
            <span className="w-px h-8 bg-border" />
            <div className="px-3 py-2">
              <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Type</div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${isShort ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"}`}>
                  <TypeIcon format={videoFormat} className="w-3 h-3" />
                </span>
              </div>
            </div>
            {size != null && (
              <>
                <span className="w-px h-8 bg-border" />
                <div className="px-3 py-2">
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Size</div>
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-dim" />
                    <span className="text-[12px] text-sensor font-medium">{formatBytes(size)}</span>
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

  // ── Empty state — drop zone (same card shape as VideoDetail) ──
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
      {/* Thumbnail area — upload placeholder */}
      <div className={`relative shrink-0 p-3 ${thumbW}`}>
        <div className={`
          w-full ${thumbAspect} rounded-xl flex items-center justify-center transition-colors
          ${dragOver ? "bg-blue/10 border border-blue/30 border-dashed" : "bg-elevated"}
        `}>
          <div className="flex flex-col items-center gap-2">
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center transition-colors
              ${dragOver ? "bg-blue/20" : "bg-surface/80"}
            `}>
              <Upload className={`w-5 h-5 transition-colors ${dragOver ? "text-blue" : "text-dim"}`} />
            </div>
            <span className="text-[10px] font-mono text-dim uppercase tracking-wider">
              {dragOver ? "Drop here" : isShort ? "Short" : "Video"}
            </span>
          </div>
        </div>
      </div>

      {/* Info right */}
      <div className="flex-1 flex flex-col gap-4 py-4 pr-5 pl-1 max-md:pt-0 max-md:px-4 max-md:pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight max-lg:text-sm" dir="rtl" style={{ textAlign: "right" }}>
            {headline || (dragOver ? "Drop to upload" : "Upload video")}
            {required && !dragOver && <span className="text-red-400 ml-1">*</span>}
          </h2>
          <p className="text-[11px] text-dim mt-1" dir="rtl" style={{ textAlign: "right" }}>
            Drag & drop or click to select — MP4, WebM, MOV, AVI, MKV
          </p>
        </div>

        {/* Metadata grid — STATUS / TYPE / REQUIRED */}
        <div className="flex items-center gap-0 mt-auto ml-auto">
          <div className="px-3 py-2">
            <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Status</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex text-dim"><Clock className="w-3.5 h-3.5" /></span>
              <span className="text-[12px] text-sensor font-medium">Pending</span>
            </div>
          </div>
          <span className="w-px h-8 bg-border" />
          <div className="px-3 py-2">
            <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">Type</div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${isShort ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue"}`}>
                <TypeIcon format={videoFormat} className="w-3 h-3" />
              </span>
            </div>
          </div>
          {required && (
            <>
              <span className="w-px h-8 bg-border" />
              <div className="px-3 py-2">
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
