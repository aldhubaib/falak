import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  ExternalLink,
  Circle,
  ArrowLeft,
  RotateCw,
  Trash2,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { storyQueue } from "@/lib/uploadQueue";

type ProcessingStep =
  | "uploading"
  | "processing"
  | "ready"
  | "done"
  | "error"
  | "stalled";

interface QueueItem {
  storyId: string;
  headline: string;
  fileName: string;
  fileSize: number;
  step: ProcessingStep;
  error?: string;
  brief?: Record<string, unknown>;
  createdAt: string;
  stage?: string;
}

function deriveStep(brief: Record<string, unknown> | undefined, stage: string | undefined): ProcessingStep {
  if (stage === "done") return "done";
  if (!brief) return "uploading";
  const hasVideo = !!brief.videoR2Key;
  const hasTranscript = !!brief.transcript;
  const hasTitle = !!brief.suggestedTitle;
  const hasTags = brief.youtubeTags && Array.isArray(brief.youtubeTags) && (brief.youtubeTags as unknown[]).length > 0;
  const hasYoutubeUrl = !!brief.youtubeUrl;

  if (hasYoutubeUrl) return "done";
  if (!hasVideo) return "uploading";
  if (brief.processingStatus === "processing") return "processing";
  if (hasTranscript && hasTitle && hasTags) return "ready";
  if (brief.processingStatus === "error") return "error";
  if (hasVideo && brief.processingStatus !== "done") return "stalled";
  return "ready";
}

const STEP_META: Record<ProcessingStep, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  uploading:    { label: "Uploading",        icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,   color: "text-primary",         bg: "bg-primary/10" },
  processing:   { label: "AI Processing",    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,   color: "text-purple",       bg: "bg-purple/10" },
  ready:        { label: "Ready to Publish", icon: <CheckCircle2 className="w-3.5 h-3.5" />,            color: "text-success",      bg: "bg-success/10" },
  done:         { label: "Done",             icon: <CheckCircle2 className="w-3.5 h-3.5" />,            color: "text-success",      bg: "bg-success/10" },
  error:        { label: "Error",            icon: <AlertCircle className="w-3.5 h-3.5" />,             color: "text-destructive",  bg: "bg-destructive/10" },
  stalled:      { label: "Upload Stalled",   icon: <AlertCircle className="w-3.5 h-3.5" />,             color: "text-orange",       bg: "bg-orange/10" },
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

function elapsedTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

const STEP_PROGRESS: Record<ProcessingStep, number> = {
  uploading: 10,
  processing: 50,
  ready: 100,
  done: 100,
  error: 0,
  stalled: 0,
};

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

const FILTER_TABS = ["All", "In Progress", "Stalled", "Ready", "Done"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

export default function PublishQueue() {
  const { channelId } = useParams();
  const channelPath = useChannelPath();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [existingStories, setExistingStories] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const uploadTasks = useSyncExternalStore(storyQueue.subscribe, storyQueue.getSnapshot);

  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadExistingStories = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/stories?channelId=${channelId}&origin=manual`, { credentials: "include" });
      if (!res.ok) return;
      const stories = await res.json();
      const manualStories = stories
        .filter((s: any) => s.origin === "manual")
        .map((s: any) => {
          const step = deriveStep(s.brief, s.stage);
          return {
            storyId: s.id,
            headline: s.headline,
            fileName: s.brief?.videoFileName || "",
            fileSize: s.brief?.videoFileSize || 0,
            step: step === "uploading" ? "stalled" as ProcessingStep : step,
            brief: s.brief || {},
            createdAt: s.createdAt,
            stage: s.stage,
          };
        });
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

  // When upload completes, fire background AI processing and mark as clickable
  useEffect(() => {
    setQueue((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.step !== "uploading") return item;
        const task = uploadTasks.find((t) => t.metadata.storyId === item.storyId);
        if (task?.status === "completed") {
          changed = true;
          fetch(`/api/stories/${item.storyId}/process`, { method: "POST", credentials: "include" }).catch(() => {});
          return { ...item, step: "processing" as ProcessingStep };
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

  const handleRetryProcessing = async (storyId: string) => {
    try {
      setQueue((prev) => prev.map((q) =>
        q.storyId === storyId ? { ...q, step: "processing" as ProcessingStep, error: undefined } : q
      ));
      setExistingStories((prev) => prev.map((s) =>
        s.storyId === storyId ? { ...s, step: "processing" as ProcessingStep, error: undefined } : s
      ));
      await fetch(`/api/stories/${storyId}/process`, { method: "POST", credentials: "include" });
      toast.info("Retrying processing…");
    } catch {
      toast.error("Failed to retry");
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

        storyQueue.addFile(file, { storyId: story.id });
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

  const [reuploadStoryId, setReuploadStoryId] = useState<string | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);

  const handleReupload = (storyId: string) => {
    setReuploadStoryId(storyId);
    setTimeout(() => reuploadInputRef.current?.click(), 0);
  };

  const handleReuploadFile = (file: File) => {
    if (!reuploadStoryId) return;
    const existing = allItems.find((s) => s.storyId === reuploadStoryId);
    if (existing) {
      const updatedItem: QueueItem = {
        ...existing,
        step: "uploading",
        fileName: file.name,
        fileSize: file.size,
        error: undefined,
      };
      setQueue((prev) => [updatedItem, ...prev.filter((q) => q.storyId !== reuploadStoryId)]);
      storyQueue.addFile(file, { storyId: reuploadStoryId });
    }
    setReuploadStoryId(null);
  };

  const handleCancelUpload = (storyId: string) => {
    const task = uploadTasks.find((t) => t.metadata?.storyId === storyId);
    if (task) storyQueue.cancel(task.id);
    setQueue((prev) =>
      prev.map((item) =>
        item.storyId === storyId ? { ...item, step: "stalled" as ProcessingStep, error: "Upload cancelled" } : item
      )
    );
  };

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const handleDeleteStory = async (storyId: string) => {
    setDeletingIds((prev) => new Set(prev).add(storyId));
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      setExistingStories((prev) => prev.filter((s) => s.storyId !== storyId));
      setQueue((prev) => prev.filter((q) => q.storyId !== storyId));
      toast.success("Story deleted");
    } catch {
      toast.error("Failed to delete story");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(storyId); return next; });
    }
  };

  const allItems = [
    ...queue,
    ...existingStories.filter((es) => !queue.some((q) => q.storyId === es.storyId)),
  ];

  const stalledCount = allItems.filter((i) => i.step === "stalled").length;
  const inProgressCount = allItems.filter((i) => i.step !== "ready" && i.step !== "done" && i.step !== "error" && i.step !== "stalled").length;
  const readyCount = allItems.filter((i) => i.step === "ready").length;
  const doneCount = allItems.filter((i) => i.step === "done").length;

  const counts: Record<FilterTab, number> = {
    All: allItems.length,
    "In Progress": inProgressCount,
    Stalled: stalledCount,
    Ready: readyCount,
    Done: doneCount,
  };

  // Poll processing items to update their status when AI finishes
  const processingKey = allItems.filter((i) => i.step === "processing").map((i) => i.storyId).join(",");
  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(",");
    const interval = setInterval(async () => {
      for (const sid of ids) {
        try {
          const res = await fetch(`/api/stories/${sid}`, { credentials: "include" });
          if (!res.ok) continue;
          const story = await res.json();
          const step = deriveStep(story.brief, story.stage);
          if (step !== "processing") {
            setQueue((prev) => prev.map((q) =>
              q.storyId === sid ? { ...q, step, headline: story.headline || q.headline, brief: story.brief } : q
            ));
            setExistingStories((prev) => prev.map((s) =>
              s.storyId === sid ? { ...s, step, headline: story.headline || s.headline, brief: story.brief } : s
            ));
            if (step === "ready") toast.success(`${story.headline || "Video"} — ready to publish`);
          }
        } catch { /* silent */ }
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [processingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = allItems.filter((item) => {
    if (activeFilter === "In Progress") return item.step !== "ready" && item.step !== "done" && item.step !== "error" && item.step !== "stalled";
    if (activeFilter === "Stalled") return item.step === "stalled";
    if (activeFilter === "Ready") return item.step === "ready";
    if (activeFilter === "Done") return item.step === "done";
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <Link
            to={channelPath("/stories")}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors no-underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="max-sm:hidden">Stories</span>
          </Link>
          <span className="w-px h-5 bg-border" />
          <h1 className="text-sm font-semibold">Publish Queue</h1>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          <Upload className="w-3 h-3" />
          Upload
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Stats row */}
        <div className="px-6 pt-4 max-lg:px-4 mb-4">
          <div className="flex rounded-lg overflow-hidden border border-border">
            <div className="px-5 py-4 bg-card border-r border-border min-w-[120px]">
              <div className="text-2xl font-semibold font-mono tracking-tight">{allItems.length}</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Total</div>
            </div>
            <div className="flex-1 px-5 py-4 bg-card border-r border-border">
              <div className="text-2xl font-semibold font-mono tracking-tight text-primary">{inProgressCount}</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">In Progress</div>
            </div>
            {stalledCount > 0 && (
              <div className="flex-1 px-5 py-4 bg-card border-r border-border">
                <div className="text-2xl font-semibold font-mono tracking-tight text-orange">{stalledCount}</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Stalled</div>
              </div>
            )}
            <div className="flex-1 px-5 py-4 bg-card border-r border-border">
              <div className="text-2xl font-semibold font-mono tracking-tight text-orange">{readyCount}</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Ready</div>
            </div>
            <div className="flex-1 px-5 py-4 bg-card">
              <div className="text-2xl font-semibold font-mono tracking-tight text-success">{doneCount}</div>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Done</div>
            </div>
          </div>
        </div>

        <div className="px-6 max-lg:px-4 max-sm:px-3 pb-16 space-y-4">
          {/* Upload drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              rounded-lg border-2 border-dashed cursor-pointer transition-all p-8
              ${dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30 bg-card"
              }
            `}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragOver ? "bg-primary/20" : "bg-card"}`}>
                <Upload className={`w-6 h-6 transition-colors ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-[14px] font-semibold">
                  {dragOver ? "Drop videos here" : "Upload Videos"}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Drag & drop or click to select — MP4, WebM, MOV, AVI, MKV
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Upload completes instantly — AI transcription & metadata run in the background
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
          <input
            ref={reuploadInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReuploadFile(file);
              e.target.value = "";
            }}
          />

          {/* Filter tabs */}
          <div className="flex items-center gap-1.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors whitespace-nowrap border ${
                  activeFilter === tab
                    ? "bg-card text-foreground border-border"
                    : "bg-transparent text-muted-foreground border-border/50 hover:text-muted-foreground hover:border-border"
                }`}
              >
                {tab} <span className="text-[11px] opacity-60">({counts[tab]})</span>
              </button>
            ))}
          </div>

          {/* Queue list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Upload}
              title={allItems.length === 0 ? "No videos yet" : "No videos in this filter"}
            />
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_100px_160px_100px] max-md:grid-cols-[1fr_100px_100px] gap-0 px-4 py-2.5 bg-card border-b border-border">
                {["VIDEO", "SIZE", "TIME", "STATUS", ""].map((h, i) => (
                  <span
                    key={h || i}
                    className={`text-[10px] text-muted-foreground font-mono uppercase tracking-wider ${
                      i > 0 ? "text-center" : ""
                    } ${(i === 2 || i === 3) ? "max-md:hidden" : ""} ${i === 4 ? "text-end" : ""}`}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {filtered.map((item) => {
                const meta = STEP_META[item.step];
                const uploadTask = uploadTasks.find((t) => t.metadata?.storyId === item.storyId);
                const isProcessing = item.step === "uploading" || item.step === "processing";
                const isStalled = item.step === "stalled";
                const isActionable = item.step === "done" || item.step === "ready" || item.step === "error" || item.step === "processing";
                const uploadProgress = item.step === "uploading" && uploadTask?.status === "uploading"
                  ? uploadTask.progress
                  : null;
                const isDeleting = deletingIds.has(item.storyId);

                return (
                  <div
                    key={item.storyId}
                    className={`group grid grid-cols-[1fr_100px_100px_160px_100px] max-md:grid-cols-[1fr_100px_100px] gap-0 px-4 py-3 border-b border-border last:border-b-0 items-center transition-colors ${
                      isActionable
                        ? "hover:bg-card cursor-pointer"
                        : isStalled
                        ? "bg-orange/[0.02]"
                        : "bg-card"
                    } ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => {
                      if (isActionable) navigate(channelPath(`/story/${item.storyId}`));
                    }}
                  >
                    {/* Video */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                          {isStalled ? (
                            <AlertCircle className="w-3.5 h-3.5 text-orange" />
                          ) : isProcessing ? (
                            <Loader2 className={`w-3.5 h-3.5 animate-spin ${meta.color}`} />
                          ) : item.step === "done" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          ) : item.step === "ready" ? (
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
                            <p className="text-[10px] text-muted-foreground font-mono truncate">{item.fileName}</p>
                          )}
                        </div>
                      </div>
                      {uploadProgress != null && (
                        <div className="mt-1.5 ml-9">
                          <div className="w-full h-1 bg-card rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-mono text-muted-foreground">{Math.round(uploadProgress)}%</span>
                            {uploadTask?.etaSeconds != null && uploadTask.etaSeconds > 0 && (
                              <span className="text-[9px] font-mono text-muted-foreground">~{uploadTask.etaSeconds}s left</span>
                            )}
                          </div>
                        </div>
                      )}
                      {isStalled && (
                        <p className="text-[10px] text-orange/80 ml-9 mt-1">
                          Upload never completed — re-upload the file or delete this story
                        </p>
                      )}
                      {item.error && (
                        <p className="text-[10px] text-destructive ml-9 mt-1 truncate" title={item.error}>{item.error}</p>
                      )}
                    </div>

                    {/* Size */}
                    <div className="text-center">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {item.fileSize ? formatBytes(item.fileSize) : "—"}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-center max-md:hidden">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {item.createdAt ? relativeTime(item.createdAt) : "—"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-center max-md:hidden">
                      {item.step === "ready" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-[11px] font-medium">
                          <Circle className="w-2 h-2 fill-current" />
                          Ready
                        </span>
                      ) : item.step === "done" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success/70 text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Done
                        </span>
                      ) : item.step === "error" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium">
                          <AlertCircle className="w-3 h-3" />
                          Error
                        </span>
                      ) : isStalled ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange/10 text-orange text-[11px] font-medium">
                          <AlertCircle className="w-3 h-3" />
                          Stalled
                        </span>
                      ) : item.step === "processing" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple/10 text-purple text-[11px] font-medium">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          AI Processing
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${meta.color}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                          {item.step === "uploading" && uploadProgress != null && (
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {Math.round(uploadProgress)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-end gap-1">
                      {isStalled && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReupload(item.storyId); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            <RotateCw className="w-3 h-3" />
                            Re-upload
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteStory(item.storyId); }}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {item.step === "error" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetryProcessing(item.storyId); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReupload(item.storyId); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground hover:bg-card transition-colors"
                          >
                            <RotateCw className="w-3 h-3" />
                            Re-upload
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteStory(item.storyId); }}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {item.step === "uploading" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancelUpload(item.storyId); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      )}
                      {isActionable && (
                        <Link
                          to={channelPath(`/story/${item.storyId}`)}
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors no-underline"
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
