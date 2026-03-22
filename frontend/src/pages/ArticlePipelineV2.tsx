import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import SourceTab from "./Source";
import VectorIntelligenceTab from "./VectorIntelligence";
import StoryRulesTab from "./StoryRules";
import {
  Loader2, Pause, Play, Circle, CheckCircle2, AlertTriangle,
  ChevronRight, ChevronDown, Youtube, FileText, Download,
  RotateCw, FlaskConical, X, ArrowRight, Filter,
  Brain, Languages, Sparkles, Search, Hash, Layers,
  Monitor, Zap,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─── */

interface BatchEvent {
  pipeline: "article" | "video";
  type: "tick_start" | "tick_end" | "batch_start" | "batch_done" | "stage_done" | "step";
  stage?: string;
  batchId?: number;
  count?: number;
  failed?: number;
  processed?: number;
  hadWork?: boolean;
  catchup?: boolean;
  step?: string;
  label?: string;
  status?: string;
  service?: string;
  processor?: string;
  articleId?: string;
  ts: number;
}

interface StageStats {
  queued: number;
  running: number;
}

/* ─── Constants ─── */

const VIDEO_STAGES = [
  { id: "import", label: "Import", icon: Download, color: "text-orange", bg: "bg-orange" },
  { id: "transcribe", label: "Transcribe", icon: Youtube, color: "text-red-400", bg: "bg-red-400" },
  { id: "comments", label: "Comments", icon: FileText, color: "text-primary", bg: "bg-primary" },
  { id: "analyzing", label: "Analyzing", icon: Brain, color: "text-purple", bg: "bg-purple" },
];

const ARTICLE_STAGES = [
  { id: "transcript", label: "Transcript", icon: Youtube, color: "text-red-400", bg: "bg-red-400" },
  { id: "story_count", label: "Story Count", icon: Hash, color: "text-red-400", bg: "bg-red-400" },
  { id: "story_split", label: "Story Split", icon: Layers, color: "text-red-400", bg: "bg-red-400" },
  { id: "imported", label: "Imported", icon: Download, color: "text-orange", bg: "bg-orange" },
  { id: "content", label: "Content", icon: FileText, color: "text-primary", bg: "bg-primary" },
  { id: "classify", label: "Classify", icon: Brain, color: "text-success", bg: "bg-success" },
  { id: "title_translate", label: "Title Translate", icon: Languages, color: "text-primary", bg: "bg-primary" },
  { id: "score", label: "Score", icon: Sparkles, color: "text-orange", bg: "bg-orange" },
  { id: "research", label: "Research", icon: Search, color: "text-purple", bg: "bg-purple" },
  { id: "translated", label: "Translation", icon: Languages, color: "text-primary", bg: "bg-primary" },
];

const OUTCOMES = [
  { id: "done", label: "Done", color: "text-success", bg: "bg-success", icon: CheckCircle2 },
  { id: "filtered", label: "Filtered", color: "text-muted-foreground", bg: "bg-muted-foreground", icon: Filter },
  { id: "review", label: "Review", color: "text-orange", bg: "bg-orange", icon: AlertTriangle },
  { id: "failed", label: "Failed", color: "text-destructive", bg: "bg-destructive", icon: AlertTriangle },
];

/* ─── Tabs ─── */

const TABS = ["pipeline", "sources", "story_rules", "intelligence"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  pipeline: "Pipeline",
  sources: "Sources",
  story_rules: "Story Rules",
  intelligence: "Intelligence",
};

/* ─── Main Component ─── */

export default function ArticlePipelineV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "pipeline";
  const setTab = (tab: Tab) => setSearchParams(tab === "pipeline" ? {} : { tab }, { replace: true });

  if (activeTab === "sources") return <Shell activeTab={activeTab} setTab={setTab}><SourceTab /></Shell>;
  if (activeTab === "story_rules") return <Shell activeTab={activeTab} setTab={setTab}><StoryRulesTab /></Shell>;
  if (activeTab === "intelligence") return <Shell activeTab={activeTab} setTab={setTab}><VectorIntelligenceTab /></Shell>;
  return <Shell activeTab={activeTab} setTab={setTab}><PipelineView /></Shell>;
}

function Shell({ activeTab, setTab, children }: { activeTab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center gap-0 px-6 border-b border-border shrink-0 max-lg:px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`relative h-full px-4 text-[13px] font-medium transition-colors ${
              activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
            {activeTab === tab && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/* ─── Pipeline View (vertical trees + SSE) ─── */

function PipelineView() {
  const { channelId } = useParams();
  const pp = useChannelPath();
  const [articleStats, setArticleStats] = useState<Record<string, number>>({});
  const [videoStats, setVideoStats] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<BatchEvent[]>([]);
  const [activeBatches, setActiveBatches] = useState<Map<number, BatchEvent>>(new Map());
  const [connected, setConnected] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [stepEvents, setStepEvents] = useState<BatchEvent[]>([]);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(() => {
    if (!channelId) return;
    fetch(`/api/article-pipeline/stats-combined?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        setArticleStats(d.articleStats || {});
        setVideoStats(d.videoStats || {});
        setPaused(d.paused);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/article-pipeline/live", { withCredentials: true });
    let statsTimer: ReturnType<typeof setInterval>;

    es.onopen = () => setConnected(true);

    es.onmessage = (msg) => {
      try {
        const evt: BatchEvent = JSON.parse(msg.data);
        setEvents((prev) => {
          const next = [...prev, evt];
          return next.length > 200 ? next.slice(-200) : next;
        });

        if (evt.type === "batch_start" && evt.batchId != null) {
          setActiveBatches((prev) => {
            const next = new Map(prev);
            next.set(evt.batchId!, evt);
            return next;
          });
        }
        if (evt.type === "batch_done" && evt.batchId != null) {
          setActiveBatches((prev) => {
            const next = new Map(prev);
            next.delete(evt.batchId!);
            return next;
          });
        }

        if (evt.type === "step") {
          setStepEvents((prev) => {
            const next = [...prev, evt];
            return next.length > 500 ? next.slice(-500) : next;
          });
        }

        // Refresh stats on tick_end or stage_done
        if (evt.type === "tick_end" || evt.type === "stage_done") {
          fetchStats();
          setStepEvents([]); // clear step events on tick boundary
        }
      } catch (_) {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Fallback to polling
      statsTimer = setInterval(fetchStats, 5000);
    };

    return () => {
      es.close();
      if (statsTimer) clearInterval(statsTimer);
    };
  }, [fetchStats]);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const handlePauseResume = () => {
    const endpoint = paused ? "/api/article-pipeline/resume" : "/api/article-pipeline/pause";
    fetch(endpoint, { method: "POST", credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { setPaused(d.paused); toast.success(d.paused ? "Paused" : "Resumed"); })
      .catch(() => toast.error("Failed"));
  };

  const hasVideo = (videoStats.total ?? 0) > 0;
  const articleTotal = articleStats.total ?? 0;
  const articleDone = articleStats.done ?? 0;
  const donePct = articleTotal > 0 ? ((articleDone / articleTotal) * 100).toFixed(1) : "0";

  // Find bottleneck (highest count in active stages)
  const articleProcessing = ARTICLE_STAGES.reduce((sum, s) => sum + (articleStats[s.id] ?? 0), 0);
  const bottleneck = ARTICLE_STAGES.reduce<{ id: string; count: number } | null>((best, s) => {
    const c = articleStats[s.id] ?? 0;
    return c > (best?.count ?? 0) ? { id: s.id, count: c } : best;
  }, null);

  // Recent events for the activity feed (last 50 batch_done events)
  const batchDoneEvents = events.filter((e) => e.type === "batch_done").slice(-50);

  // Active batches per stage
  const activeBatchesByStage = (pipeline: string, stageId: string) => {
    return Array.from(activeBatches.values()).filter(
      (b) => b.pipeline === pipeline && b.stage === stageId
    );
  };

  // Recent step events per stage (for sub-step indicators)
  const stepsByStage = (stageId: string) => {
    return stepEvents.filter((e) => e.stage === stageId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-xl mx-auto px-6 py-6 max-lg:px-4">

        {/* ── Controls ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePauseResume}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                paused ? "bg-orange/15 text-orange hover:bg-orange/25" : "bg-success/15 text-success hover:bg-success/25"
              }`}
            >
              <Circle className="w-2 h-2 fill-current" />
              {paused ? "Paused" : "Running"}
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono ${
              connected ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-success animate-pulse" : "bg-destructive"}`} />
              {connected ? "Live" : "Reconnecting…"}
            </div>
          </div>
          <Link
            to={pp("/article-pipeline")}
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
          >
            Switch to V1
          </Link>
        </div>

        {/* ── Summary card ── */}
        <div className="rounded-xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-5">
              <div>
                <span className="text-2xl font-semibold font-mono">{articleTotal}</span>
                <span className="text-[11px] text-muted-foreground ml-1.5">total</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="text-lg font-semibold font-mono text-success">{articleDone}</span>
                  <span className="text-[10px] text-muted-foreground block font-mono">done ({donePct}%)</span>
                </div>
                <div className="text-center">
                  <span className="text-lg font-semibold font-mono text-primary">{articleProcessing}</span>
                  <span className="text-[10px] text-muted-foreground block font-mono">processing</span>
                </div>
                {(articleStats.failed ?? 0) > 0 && (
                  <div className="text-center">
                    <span className="text-lg font-semibold font-mono text-destructive">{articleStats.failed}</span>
                    <span className="text-[10px] text-muted-foreground block font-mono">failed</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${articleTotal > 0 ? (articleDone / articleTotal) * 100 : 0}%` }} />
          </div>
        </div>

        {/* ── Video Pipeline Tree ── */}
        {hasVideo && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Youtube className="w-4 h-4 text-red-400" />
              <span className="text-[13px] font-semibold text-foreground">Video Pipeline</span>
              <span className="text-[11px] text-muted-foreground font-mono">{videoStats.total ?? 0} total</span>
            </div>
            <div className="flex flex-col items-center mb-10">
              {VIDEO_STAGES.map((stage, i) => {
                const count = videoStats[stage.id] ?? 0;
                const isActive = activeBatchesByStage("video", stage.id).length > 0;
                const batches = activeBatchesByStage("video", stage.id);
                const isLast = i === VIDEO_STAGES.length - 1;
                const isDone = (videoStats.done ?? 0) > 0;

                return (
                  <div key={stage.id} className="flex flex-col items-center w-full">
                    <StageNode
                      stage={stage}
                      count={count}
                      isActive={isActive}
                      activeBatches={batches}
                      isBottleneck={false}
                      isDone={count === 0 && i === 0 && isDone}
                      expanded={expandedStage === `video:${stage.id}`}
                      onToggle={() => setExpandedStage(expandedStage === `video:${stage.id}` ? null : `video:${stage.id}`)}
                      recentBatches={batchDoneEvents.filter((e) => e.pipeline === "video" && e.stage === stage.id)}
                      liveSteps={stepsByStage(stage.id)}
                    />
                    {!isLast && <Connector active={count === 0} />}
                  </div>
                );
              })}
              {/* Done node */}
              <Connector active={(videoStats.done ?? 0) > 0} />
              <OutcomeNode label="Done" count={videoStats.done ?? 0} color="text-success" bg="bg-success" icon={CheckCircle2} />
            </div>
          </>
        )}

        {/* ── Article Pipeline Tree ── */}
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">Article Pipeline</span>
          <span className="text-[11px] text-muted-foreground font-mono">{articleProcessing} active</span>
        </div>
        <div className="flex flex-col items-center mb-8">
          {ARTICLE_STAGES.map((stage, i) => {
            const count = articleStats[stage.id] ?? 0;
            const isActive = activeBatchesByStage("article", stage.id).length > 0;
            const batches = activeBatchesByStage("article", stage.id);
            const isBottleneck = bottleneck?.id === stage.id && bottleneck.count > 0;
            const isLast = i === ARTICLE_STAGES.length - 1;

            return (
              <div key={stage.id} className="flex flex-col items-center w-full">
                <StageNode
                  stage={stage}
                  count={count}
                  isActive={isActive}
                  activeBatches={batches}
                  isBottleneck={isBottleneck}
                  isDone={false}
                  expanded={expandedStage === `article:${stage.id}`}
                  onToggle={() => setExpandedStage(expandedStage === `article:${stage.id}` ? null : `article:${stage.id}`)}
                  recentBatches={batchDoneEvents.filter((e) => e.pipeline === "article" && e.stage === stage.id)}
                  liveSteps={stepsByStage(stage.id)}
                />
                {!isLast && <Connector active={count === 0} />}
              </div>
            );
          })}
        </div>

        {/* ── Outcomes ── */}
        <div className="grid grid-cols-4 gap-3 mb-8 max-sm:grid-cols-2">
          {OUTCOMES.map((o) => {
            const count = articleStats[o.id] ?? 0;
            const Icon = o.icon;
            return (
              <div key={o.id} className={`rounded-xl border border-border bg-card px-4 py-3 ${count === 0 ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${o.color}`} />
                  <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">{o.label}</span>
                </div>
                <span className={`text-xl font-semibold font-mono ${o.color}`}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* ── Live Activity Feed ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-[12px] font-semibold text-foreground">Live Activity</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">{batchDoneEvents.length} batches</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {batchDoneEvents.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground font-mono">
                Waiting for batch events…
              </div>
            ) : (
              batchDoneEvents.slice(-30).map((evt, i) => (
                <ActivityRow key={`${evt.batchId}-${i}`} event={evt} />
              ))
            )}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stage Node (ArticleDetail TreeNode style) ─── */

function StageNode({
  stage,
  count,
  isActive,
  activeBatches,
  isBottleneck,
  isDone,
  expanded,
  onToggle,
  recentBatches,
  liveSteps = [],
}: {
  stage: { id: string; label: string; icon: typeof FileText; color: string; bg: string };
  count: number;
  isActive: boolean;
  activeBatches: BatchEvent[];
  isBottleneck: boolean;
  isDone: boolean;
  expanded: boolean;
  onToggle: () => void;
  recentBatches: BatchEvent[];
  liveSteps?: BatchEvent[];
}) {
  const Icon = stage.icon;
  const isEmpty = count === 0 && !isActive;

  const borderColor = isBottleneck
    ? `border-current ${stage.color}`
    : isActive
      ? "border-primary/40"
      : isEmpty
        ? "border-border/50"
        : "border-border";

  const bgColor = isBottleneck
    ? `${stage.bg}/10`
    : isActive
      ? "bg-card"
      : "bg-card";

  const ringColor = isBottleneck
    ? `ring-current/20`
    : isActive
      ? "ring-primary/20"
      : "";

  return (
    <button
      onClick={onToggle}
      className={`w-full max-w-[340px] rounded-xl border-2 ${borderColor} ${bgColor} px-4 py-3 text-left transition-all hover:ring-4 ${ringColor} hover:scale-[1.02]`}
    >
      <div className="flex items-center gap-3">
        {isActive ? (
          <Loader2 className={`w-5 h-5 text-primary shrink-0 animate-spin`} />
        ) : (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isDone ? "bg-success/15" :
            isBottleneck ? `${stage.bg}/15` :
            isEmpty ? "bg-card" :
            "bg-card"
          }`}>
            <Icon className={`w-4 h-4 ${isEmpty ? "text-muted-foreground/40" : stage.color}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">{stage.label}</span>
            {isDone && count === 0 && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
            {isBottleneck && (
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${stage.bg}/60 opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${stage.bg}`} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {count > 0 && (
              <span className={`text-[11px] font-mono font-semibold ${isBottleneck ? stage.color : "text-foreground"}`}>
                {count} queued
              </span>
            )}
            {isActive && activeBatches.length > 0 && (
              <span className="text-[10px] font-mono text-primary animate-pulse">
                Processing {activeBatches[0].count}…
              </span>
            )}
            {!isActive && count === 0 && !isDone && (
              <span className="text-[10px] text-muted-foreground/50">Empty</span>
            )}
            {recentBatches.length > 0 && !isActive && (
              <span className="text-[10px] font-mono text-muted-foreground">
                Last batch: {recentBatches[recentBatches.length - 1].count} items
                {(recentBatches[recentBatches.length - 1].failed ?? 0) > 0 && (
                  <span className="text-destructive ml-1">
                    ({recentBatches[recentBatches.length - 1].failed} failed)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>

      {/* Live sub-step progress (shown when stage is active) */}
      {liveSteps.length > 0 && (
        <LiveStepTrail steps={liveSteps} stageColor={stage.color} />
      )}

      {/* Expanded batch history */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {recentBatches.length === 0 && !isActive ? (
            <div className="text-[10px] text-muted-foreground font-mono text-center py-2">No recent batches</div>
          ) : (
            <>
              {isActive && activeBatches.map((b) => (
                <div key={b.batchId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                  <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                  <span className="text-[10px] font-mono text-primary">Batch #{b.batchId}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{b.count} items</span>
                  {b.catchup && <span className="text-[9px] font-mono text-orange px-1 py-0.5 rounded bg-orange/10">catch-up</span>}
                </div>
              ))}
              {recentBatches.slice(-10).reverse().map((b, i) => (
                <div key={`${b.batchId}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card/50">
                  <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                  <span className="text-[10px] font-mono text-muted-foreground">Batch #{b.batchId}</span>
                  <span className="text-[10px] font-mono text-foreground">{b.count} items</span>
                  {(b.failed ?? 0) > 0 && (
                    <span className="text-[10px] font-mono text-destructive">{b.failed} failed</span>
                  )}
                  {b.catchup && <span className="text-[9px] font-mono text-orange px-1 py-0.5 rounded bg-orange/10">catch-up</span>}
                  <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">{fmtAgo(b.ts)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Connector (line between nodes) ─── */

function Connector({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-px h-8 ${active ? "bg-border" : "bg-border/30"}`} />
    </div>
  );
}

/* ─── Outcome Node ─── */

function OutcomeNode({ label, count, color, bg, icon: Icon }: {
  label: string; count: number; color: string; bg: string; icon: typeof CheckCircle2;
}) {
  return (
    <div className={`w-full max-w-[340px] rounded-xl border-2 px-4 py-3 ${
      count > 0 ? `border-success/40 bg-card` : "border-border/50 bg-card opacity-40"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${count > 0 ? "bg-success/15" : "bg-card"}`}>
          <Icon className={`w-4 h-4 ${count > 0 ? color : "text-muted-foreground/40"}`} />
        </div>
        <div>
          <span className="text-[13px] font-semibold text-foreground">{label}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] font-mono font-semibold ${count > 0 ? color : "text-muted-foreground/40"}`}>{count}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Activity Row ─── */

function ActivityRow({ event }: { event: BatchEvent }) {
  const stageDef = [...ARTICLE_STAGES, ...VIDEO_STAGES].find((s) => s.id === event.stage);
  const Icon = stageDef?.icon ?? FileText;
  const color = stageDef?.color ?? "text-muted-foreground";

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 border-t border-border/50 text-[10px] font-mono">
      <Icon className={`w-3 h-3 ${color} shrink-0`} />
      <span className="text-muted-foreground">{event.pipeline}</span>
      <span className={`font-semibold ${color}`}>{event.stage}</span>
      <span className="text-foreground">{event.count} items</span>
      {(event.failed ?? 0) > 0 && <span className="text-destructive">{event.failed} failed</span>}
      {event.catchup && <span className="text-orange">catch-up</span>}
      <span className="text-muted-foreground/50 ml-auto">{fmtAgo(event.ts)}</span>
    </div>
  );
}

/* ─── Live Sub-Step Trail ─── */

const STEP_STATUS_STYLES: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  ok:         { icon: CheckCircle2, color: "text-success" },
  created:    { icon: CheckCircle2, color: "text-success" },
  linked:     { icon: CheckCircle2, color: "text-success" },
  skipped:    { icon: ArrowRight, color: "text-muted-foreground" },
  failed:     { icon: AlertTriangle, color: "text-destructive" },
  parse_error:{ icon: AlertTriangle, color: "text-destructive" },
  partial:    { icon: AlertTriangle, color: "text-orange" },
  empty:      { icon: AlertTriangle, color: "text-orange" },
};

function LiveStepTrail({ steps, stageColor }: { steps: BatchEvent[]; stageColor: string }) {
  // Deduplicate by step name, keep latest per step
  const byStep = new Map<string, BatchEvent>();
  for (const s of steps) {
    if (s.step) byStep.set(s.step, s);
  }
  const uniqueSteps = Array.from(byStep.values());

  // Group by articleId to show per-article progress
  const byArticle = new Map<string, BatchEvent[]>();
  for (const s of steps) {
    const key = s.articleId || "unknown";
    if (!byArticle.has(key)) byArticle.set(key, []);
    byArticle.get(key)!.push(s);
  }

  // Show compact view: unique steps as pills
  if (uniqueSteps.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
        <Zap className="w-2.5 h-2.5" />
        <span>Live Steps ({byArticle.size} {byArticle.size === 1 ? "article" : "articles"})</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {uniqueSteps.map((s) => {
          const style = STEP_STATUS_STYLES[s.status || "ok"] || { icon: CheckCircle2, color: stageColor };
          const StepIcon = style.icon;
          return (
            <span
              key={s.step}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                s.status === "ok" || s.status === "created"
                  ? "bg-success/5 border-success/20 text-success"
                  : s.status === "failed" || s.status === "parse_error"
                    ? "bg-destructive/5 border-destructive/20 text-destructive"
                    : s.status === "skipped"
                      ? "bg-card border-border/50 text-muted-foreground"
                      : `bg-primary/5 border-primary/20 ${stageColor}`
              }`}
            >
              <StepIcon className="w-2.5 h-2.5" />
              {s.label || s.step}
              {s.service && <span className="text-muted-foreground/60 ml-0.5">{s.service}</span>}
            </span>
          );
        })}
      </div>
      {/* Per-article breakdown when multiple articles are being processed */}
      {byArticle.size > 1 && (
        <div className="space-y-1 mt-1">
          {Array.from(byArticle.entries()).slice(0, 5).map(([artId, artSteps]) => (
            <div key={artId} className="flex items-center gap-1.5 text-[9px] font-mono">
              <span className="text-muted-foreground/50 w-16 truncate">{artId.slice(-6)}</span>
              <div className="flex gap-0.5">
                {artSteps.map((s, i) => {
                  const isOk = s.status === "ok" || s.status === "created" || s.status === "linked";
                  const isFail = s.status === "failed" || s.status === "parse_error";
                  return (
                    <span
                      key={`${s.step}-${i}`}
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOk ? "bg-success" : isFail ? "bg-destructive" : "bg-primary"
                      }`}
                      title={`${s.label || s.step}: ${s.status}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
