import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import { RotateCw, Pause, Play, Circle, AlertTriangle, ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";

// ── Types matching GET /api/pipeline response ──────────────────────────────

interface ApiVideo {
  id: string;
  youtubeId?: string;
  titleAr?: string;
  thumbnailUrl?: string;
  channel?: { id: string; nameAr?: string; handle?: string; avatarUrl?: string | null };
}

interface ApiPipelineItem {
  id: string;
  stage: string;
  status: string;
  error?: string | null;
  retries: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  video?: ApiVideo | null;
}

interface PipelineData {
  stats: {
    total: number;
    import: number;
    transcribe: number;
    comments: number;
    analyzing: number;
    done: number;
    failed: number;
  };
  byStage: Record<string, ApiPipelineItem[]>;
  paused: boolean;
}

const STAGE_DEFS: { id: string; number: number; label: string; color: string }[] = [
  { id: "import",    number: 1, label: "Import",        color: "text-orange" },
  { id: "transcribe",number: 2, label: "Transcribe",    color: "text-blue" },
  { id: "comments",  number: 3, label: "Comments",      color: "text-purple" },
  { id: "analyzing", number: 4, label: "AI Analysis",   color: "text-success" },
  { id: "failed",    number: 0, label: "Failed",        color: "text-destructive" },
];

export default function Pipeline() {
  const { channelId } = useParams();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const fetchPipeline = useCallback(() => {
    const url = channelId
      ? `/api/pipeline?limit=2000&channelId=${encodeURIComponent(channelId)}`
      : "/api/pipeline?limit=2000";
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: PipelineData) => {
        setData(d);
        setPaused(d.paused);
      })
      .catch(() => toast.error("Failed to load pipeline data"))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // Auto-refresh every 30s
  useEffect(() => {
    setCountdown(30);
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchPipeline();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchPipeline]);

  const handlePauseResume = () => {
    const endpoint = paused ? "/api/pipeline/resume" : "/api/pipeline/pause";
    fetch(endpoint, { method: "POST", credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error();
        setPaused(!paused);
        toast.success(paused ? "Pipeline resumed" : "Pipeline paused");
      })
      .catch(() => toast.error("Failed to update pipeline state"));
  };

  const handleRetryAll = () => {
    setRetryingAll(true);
    fetch("/api/pipeline/retry-all-failed", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => {
        toast.success(`Retrying ${d.retried} failed items`);
        fetchPipeline();
      })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  const failedCount = data?.stats.failed ?? 0;
  const totalVideos = data?.stats.total ?? 0;
  const doneCount = data?.stats.done ?? 0;
  const inPipeline = totalVideos - doneCount;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-medium text-foreground">Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
            paused ? "bg-orange/15 text-orange" : "bg-success/15 text-success"
          }`}>
            <Circle className="w-2 h-2 fill-current" />
            {paused ? "Paused" : `Running · ${countdown}s`}
          </span>
          <button
            onClick={handlePauseResume}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          {failedCount > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3 h-3 ${retryingAll ? "animate-spin" : ""}`} />
              Retry all failed ({failedCount})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="px-6 max-lg:px-4 mb-5 pt-5">
              <div className="flex rounded-xl overflow-hidden border border-border">
                <div className="px-5 py-4 bg-background border-r border-border min-w-[140px]">
                  <div className="text-2xl font-semibold font-mono tracking-tight">{totalVideos}</div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Total Videos</div>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-dim font-mono">
                    <span>{inPipeline} in pipeline</span>
                    <span>{doneCount} done</span>
                  </div>
                </div>
                {STAGE_DEFS.filter(s => s.id !== "failed").map((stage) => {
                  const count = data?.stats[stage.id as keyof typeof data.stats] ?? 0;
                  return (
                    <div key={stage.id} className="flex-1 px-5 py-4 bg-background border-r border-border last:border-r-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-semibold font-mono tracking-tight ${stage.color}`}>{count}</span>
                      </div>
                      <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">{stage.label}</div>
                    </div>
                  );
                })}
                <div className="px-5 py-4 bg-background min-w-[120px]">
                  <span className="text-2xl font-semibold font-mono tracking-tight text-destructive">{failedCount}</span>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Failed</div>
                </div>
              </div>
            </div>

            {/* Stage columns */}
            <div className="px-6 pb-8 max-lg:px-4 overflow-x-auto">
              <div className="grid grid-cols-3 gap-4 mb-4 max-lg:grid-cols-1 items-start">
                {STAGE_DEFS.slice(0, 3).map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    items={data?.byStage[stage.id] ?? []}
                    onRetry={fetchPipeline}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 items-start">
                {STAGE_DEFS.slice(3).map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    items={data?.byStage[stage.id] ?? []}
                    onRetry={fetchPipeline}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  items,
  onRetry,
}: {
  stage: { id: string; number: number; label: string; color: string };
  items: ApiPipelineItem[];
  onRetry: () => void;
}) {
  const isFailed = stage.id === "failed";
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryAll = () => {
    setRetryingAll(true);
    fetch("/api/pipeline/retry-all-failed", { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => {
        toast.success(`Retrying ${d.retried} items`);
        onRetry();
      })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  return (
    <div
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{ height: "420px" }}
    >
      {/* Stage header */}
      <div className="px-4 py-3 bg-background shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              isFailed ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            }`}>
              {isFailed ? <AlertTriangle className="w-3 h-3" /> : stage.number}
            </span>
            <span className="text-[13px] font-semibold">{stage.label}</span>
            <span className="text-[12px] text-dim font-mono">({items.length})</span>
          </div>
          {isFailed && items.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="inline-flex items-center gap-1 text-[11px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3 h-3 ${retryingAll ? "animate-spin" : ""}`} />
              Retry all
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto bg-background">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[12px] text-dim font-mono">Empty</div>
        ) : (
          items.map((item) => (
            <PipelineItemRow key={item.id} item={item} isFailed={isFailed} onRetry={onRetry} />
          ))
        )}
      </div>
    </div>
  );
}

function PipelineItemRow({
  item,
  isFailed,
  onRetry,
}: {
  item: ApiPipelineItem;
  isFailed: boolean;
  onRetry: () => void;
}) {
  const channelPath = useChannelPath();
  const [retrying, setRetrying] = useState(false);
  const video = item.video;
  const channel = video?.channel;

  const timeInStage = item.startedAt
    ? formatElapsed(new Date(item.startedAt))
    : undefined;

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    fetch(`/api/pipeline/${item.id}/retry`, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Item queued for retry"); onRetry(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetrying(false));
  };

  const Wrapper = video?.id ? Link : "div";
  const wrapperProps = video?.id ? { to: channelPath(`/video/${video.id}`) } : {};

  return (
    <Wrapper
      className={`block px-4 py-3 border-t border-border hover:bg-surface/50 transition-colors group no-underline ${video?.id ? "cursor-pointer" : ""}`}
      {...(wrapperProps as any)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        {/* Left: avatar + status */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {channel?.avatarUrl ? (
            <img src={channel.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-elevated shrink-0" />
          )}
          <div className="min-w-0">
            {item.status === "running" && !isFailed && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                <span className="text-[11px] text-success font-mono">Processing…</span>
              </div>
            )}
            {item.status === "queued" && !isFailed && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-dim/50 shrink-0" />
                <span className="text-[11px] text-dim font-mono">Queued</span>
              </div>
            )}
            {isFailed && item.error && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-[11px] text-destructive/80 font-mono truncate max-w-[100px]">{item.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: title */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[13px] text-foreground font-medium text-right truncate" dir="rtl">
            {video?.titleAr || video?.youtubeId || item.id}
          </span>
          {video?.id && (
            <ArrowUpRight className="w-3 h-3 text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-dim font-mono">
          {timeInStage ? `⏱ ${timeInStage}` : ""}
        </span>
        <div className="flex items-center gap-2">
          {item.retries > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[10px] text-dim font-mono">
                  <RotateCw className="w-2.5 h-2.5" />
                  {item.retries}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">Attempted {item.retries} times</TooltipContent>
            </Tooltip>
          )}
          {isFailed && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50"
            >
              {retrying ? "…" : "Retry"}
            </button>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function formatElapsed(from: Date): string {
  const ms = Date.now() - from.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
