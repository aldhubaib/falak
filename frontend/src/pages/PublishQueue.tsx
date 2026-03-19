import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import {
  ArrowLeft,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Mic,
  Type,
  FileText,
  Tag,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { startUpload, subscribe, getTasks } from "@/lib/uploadManager";

type ProcessingStep = "uploading" | "transcribing" | "title" | "description" | "tags" | "done" | "error";

interface QueueItem {
  storyId: string;
  headline: string;
  fileName: string;
  fileSize: number;
  step: ProcessingStep;
  error?: string;
  brief?: Record<string, unknown>;
  createdAt: string;
}

const STEP_LABELS: Record<ProcessingStep, { label: string; icon: React.ReactNode; color: string }> = {
  uploading:    { label: "Uploading",      icon: <Upload className="w-3.5 h-3.5 animate-pulse" />,     color: "text-blue" },
  transcribing: { label: "Transcribing",   icon: <Mic className="w-3.5 h-3.5 animate-pulse" />,        color: "text-purple" },
  title:        { label: "Generating Title", icon: <Type className="w-3.5 h-3.5 animate-pulse" />,     color: "text-orange" },
  description:  { label: "Generating Desc", icon: <FileText className="w-3.5 h-3.5 animate-pulse" />, color: "text-blue" },
  tags:         { label: "Generating Tags", icon: <Tag className="w-3.5 h-3.5 animate-pulse" />,       color: "text-emerald-400" },
  done:         { label: "Ready",          icon: <CheckCircle2 className="w-3.5 h-3.5" />,             color: "text-success" },
  error:        { label: "Error",          icon: <AlertCircle className="w-3.5 h-3.5" />,              color: "text-destructive" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

export default function PublishQueue() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [existingStories, setExistingStories] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const processingRef = useRef<Set<string>>(new Set());

  const uploadTasks = useSyncExternalStore(subscribe, getTasks);

  const loadExistingStories = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/stories?channelId=${channelId}`, { credentials: "include" });
      if (!res.ok) return;
      const stories = await res.json();
      const manualStories = stories
        .filter((s: any) => s.origin === "manual")
        .map((s: any) => ({
          storyId: s.id,
          headline: s.headline,
          fileName: s.brief?.videoFileName || "",
          fileSize: s.brief?.videoFileSize || 0,
          step: (s.stage === "done" ? "done" : s.brief?.videoR2Key ? "done" : "uploading") as ProcessingStep,
          brief: s.brief || {},
          createdAt: s.createdAt,
        }));
      setExistingStories(manualStories);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadExistingStories();
  }, [loadExistingStories]);

  // Sync upload task progress into queue items
  useEffect(() => {
    setQueue((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.step !== "uploading") return item;
        const task = uploadTasks.find((t) => t.storyId === item.storyId);
        if (task?.status === "completed" && !processingRef.current.has(item.storyId)) {
          changed = true;
          processingRef.current.add(item.storyId);
          runPipeline(item.storyId);
          return { ...item, step: "transcribing" as ProcessingStep };
        }
        if (task?.status === "failed") {
          changed = true;
          return { ...item, step: "error" as ProcessingStep, error: task.error || "Upload failed" };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [uploadTasks]);

  const runPipeline = async (storyId: string) => {
    const updateStep = (step: ProcessingStep, error?: string) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.storyId === storyId ? { ...item, step, ...(error ? { error } : {}) } : item
        )
      );
    };

    try {
      // Step 1: Transcribe
      updateStep("transcribing");
      const transcribeRes = await fetch(`/api/stories/${storyId}/transcribe`, {
        method: "POST",
        credentials: "include",
      });
      if (!transcribeRes.ok) {
        const err = await transcribeRes.json().catch(() => ({ error: "Transcription failed" }));
        throw new Error(err.error || "Transcription failed");
      }

      // Step 2: Generate title
      updateStep("title");
      const titleRes = await fetch(`/api/stories/${storyId}/generate-title`, {
        method: "POST",
        credentials: "include",
      });
      if (!titleRes.ok) {
        const err = await titleRes.json().catch(() => ({ error: "Title generation failed" }));
        throw new Error(err.error || "Title generation failed");
      }
      const titleData = await titleRes.json();

      // Update headline in queue
      setQueue((prev) =>
        prev.map((item) =>
          item.storyId === storyId ? { ...item, headline: titleData.title || item.headline } : item
        )
      );

      // Step 3: Generate description
      updateStep("description");
      const descRes = await fetch(`/api/stories/${storyId}/generate-description`, {
        method: "POST",
        credentials: "include",
      });
      // Description generation is best-effort
      if (!descRes.ok) {
        console.warn("Description generation failed, continuing...");
      }

      // Step 4: Generate tags
      updateStep("tags");
      const tagsRes = await fetch(`/api/stories/${storyId}/suggest-tags`, {
        method: "POST",
        credentials: "include",
      });
      // Tags generation is best-effort
      if (!tagsRes.ok) {
        console.warn("Tags generation failed, continuing...");
      }

      updateStep("done");
      toast.success("Video processed successfully");
    } catch (e: any) {
      updateStep("error", e.message || "Processing failed");
      toast.error(e.message || "Processing failed");
    } finally {
      processingRef.current.delete(storyId);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!channelId) return;

    const fileArray = Array.from(files).filter(
      (f) => ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)
    );

    if (fileArray.length === 0) {
      toast.error("No valid video files selected");
      return;
    }

    for (const file of fileArray) {
      try {
        const res = await fetch("/api/stories/manual", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId,
            headline: file.name.replace(/\.[^.]+$/, ""),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }));
          toast.error(err.error || "Failed to create story");
          continue;
        }
        const story = await res.json();

        const newItem: QueueItem = {
          storyId: story.id,
          headline: story.headline,
          fileName: file.name,
          fileSize: file.size,
          step: "uploading",
          createdAt: story.createdAt,
        };
        setQueue((prev) => [newItem, ...prev]);

        startUpload(story.id, file).catch((err) => {
          setQueue((prev) =>
            prev.map((item) =>
              item.storyId === story.id
                ? { ...item, step: "error" as ProcessingStep, error: err.message }
                : item
            )
          );
        });
      } catch (e: any) {
        toast.error(e.message || "Failed to start upload");
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const allItems = [
    ...queue,
    ...existingStories.filter((es) => !queue.some((q) => q.storyId === es.storyId)),
  ];

  const processingCount = queue.filter(
    (q) => q.step !== "done" && q.step !== "error"
  ).length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <Link
            to={channelPath("/stories")}
            className="flex items-center gap-1.5 text-[13px] text-dim hover:text-foreground transition-colors no-underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">Stories</span>
          </Link>
          <span className="w-px h-5 bg-border" />
          <h1 className="text-sm font-semibold">Publish Queue</h1>
          {processingCount > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue/15 text-blue">
              {processingCount} processing
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 max-lg:px-4 max-sm:px-3 py-5 pb-16 space-y-5">
          {/* Upload drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              rounded-xl border-2 border-dashed cursor-pointer transition-all p-8
              ${dragOver
                ? "border-blue bg-blue/5"
                : "border-border hover:border-blue/30 bg-background"
              }
            `}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragOver ? "bg-blue/20" : "bg-elevated"}`}>
                <Upload className={`w-6 h-6 transition-colors ${dragOver ? "text-blue" : "text-dim"}`} />
              </div>
              <div>
                <p className="text-[14px] font-semibold">
                  {dragOver ? "Drop videos here" : "Upload Videos"}
                </p>
                <p className="text-[12px] text-dim mt-1">
                  Drag & drop multiple videos or click to select. MP4, WebM, MOV, AVI, MKV
                </p>
                <p className="text-[11px] text-dim/60 mt-1">
                  Each video will be automatically transcribed and have AI-generated title, description, and tags
                </p>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Queue table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-dim" />
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[13px] text-dim">No videos yet. Upload videos to get started.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_120px_100px_140px_80px] max-md:grid-cols-[1fr_100px_100px] gap-0 px-4 py-2.5 bg-elevated/50 border-b border-border text-[10px] text-dim font-mono uppercase tracking-wider">
                <span>Video</span>
                <span className="text-center">Size</span>
                <span className="text-center max-md:hidden">Time</span>
                <span className="text-center">Status</span>
                <span className="text-center max-md:hidden">Action</span>
              </div>

              {/* Table rows */}
              {allItems.map((item) => {
                const stepInfo = STEP_LABELS[item.step];
                const uploadTask = uploadTasks.find((t) => t.storyId === item.storyId);
                const isProcessing = item.step !== "done" && item.step !== "error";
                const uploadProgress = item.step === "uploading" && uploadTask?.status === "uploading"
                  ? uploadTask.progress
                  : null;

                return (
                  <div
                    key={item.storyId}
                    className={`grid grid-cols-[1fr_120px_100px_140px_80px] max-md:grid-cols-[1fr_100px_100px] gap-0 px-4 py-3 border-b border-border last:border-b-0 items-center transition-colors ${
                      item.step === "done"
                        ? "hover:bg-[#0d0d10] cursor-pointer"
                        : "bg-background"
                    }`}
                    onClick={() => {
                      if (item.step === "done" || item.step === "error") {
                        navigate(channelPath(`/story/${item.storyId}`));
                      }
                    }}
                  >
                    {/* Video name + progress */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isProcessing ? "bg-blue/10" : item.step === "done" ? "bg-success/10" : "bg-destructive/10"
                        }`}>
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue" />
                          ) : item.step === "done" ? (
                            <Play className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" dir="auto">
                            {item.headline || item.fileName}
                          </p>
                          {item.fileName && item.headline !== item.fileName && (
                            <p className="text-[10px] text-dim font-mono truncate">{item.fileName}</p>
                          )}
                        </div>
                      </div>
                      {uploadProgress != null && (
                        <div className="mt-1.5 ml-9">
                          <div className="w-full h-1 bg-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue transition-all duration-300 ease-out rounded-full"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-dim mt-0.5 block">{Math.round(uploadProgress)}%</span>
                        </div>
                      )}
                      {item.error && (
                        <p className="text-[10px] text-destructive ml-9 mt-1 truncate" title={item.error}>{item.error}</p>
                      )}
                    </div>

                    {/* Size */}
                    <div className="text-center">
                      <span className="text-[11px] font-mono text-dim">
                        {item.fileSize ? formatBytes(item.fileSize) : "—"}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-center max-md:hidden">
                      <span className="text-[10px] font-mono text-dim">
                        {item.createdAt ? relativeTime(item.createdAt) : "—"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={stepInfo.color}>{stepInfo.icon}</span>
                      <span className={`text-[11px] font-medium ${stepInfo.color}`}>{stepInfo.label}</span>
                    </div>

                    {/* Action */}
                    <div className="text-center max-md:hidden">
                      {(item.step === "done" || item.step === "error") && (
                        <Link
                          to={channelPath(`/story/${item.storyId}`)}
                          className="inline-flex items-center gap-1 text-[11px] text-blue hover:text-blue/80 font-medium transition-colors no-underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
