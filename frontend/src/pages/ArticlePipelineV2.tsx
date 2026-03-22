import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import SourceTab from "./Source";
import VectorIntelligenceTab from "./VectorIntelligence";
import StoryRulesTab from "./StoryRules";
import {
  Loader2, Pause, Play, Circle, CheckCircle2, AlertTriangle,
  ChevronRight, ChevronDown, Youtube, FileText, Download,
  RotateCw, X, Filter,
  Brain, Languages, Sparkles, Search, Hash, Layers,
  Zap, Globe, Target, Users, Image as ImageIcon, Clock,
  ExternalLink, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─── */

interface BatchEvent {
  pipeline: "article" | "video";
  type: "batch_start" | "batch_done" | "stage_done" | "step";
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

interface ApiBatch {
  id: string;
  pipeline: string;
  stage: string;
  batchSeq: number;
  itemCount: number;
  succeededCount: number;
  failedCount: number;
  catchup: boolean;
  startedAt: string;
  finishedAt: string | null;
}

interface StepLog {
  step: string;
  stage: string;
  label: string;
  status: string;
  processor?: string;
  service?: string;
  error?: string;
  chars?: number;
  at: string;
}

interface ApiBatchItem {
  id: string;
  articleId: string;
  status: string;
  error: string | null;
  durationMs: number | null;
  attempt: number;
  article: {
    id: string;
    title: string | null;
    url: string;
    stage: string;
    status: string;
    error: string | null;
  } | null;
  steps: StepLog[];
}

interface ApiBatchDetail {
  id: string;
  stage: string;
  batchSeq: number;
  itemCount: number;
  succeededCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  items: ApiBatchItem[];
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

/* ─── Pipeline View ─── */

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
  const [drawerStage, setDrawerStage] = useState<string | null>(null);
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

  // Poll stats every 8s (no tick_end events in concurrent model)
  useEffect(() => {
    const timer = setInterval(fetchStats, 8_000);
    return () => clearInterval(timer);
  }, [fetchStats]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/article-pipeline/live", { withCredentials: true });

    es.onopen = () => setConnected(true);

    es.onmessage = (msg) => {
      try {
        const evt: BatchEvent = JSON.parse(msg.data);
        setEvents((prev) => {
          const next = [...prev, evt];
          return next.length > 200 ? next.slice(-200) : next;
        });

        if (evt.type === "batch_start" && evt.batchId != null) {
          setActiveBatches((prev) => { const n = new Map(prev); n.set(evt.batchId!, evt); return n; });
        }
        if (evt.type === "batch_done" && evt.batchId != null) {
          setActiveBatches((prev) => { const n = new Map(prev); n.delete(evt.batchId!); return n; });
          fetchStats();
        }

        if (evt.type === "step") {
          setStepEvents((prev) => {
            const next = [...prev, evt];
            return next.length > 500 ? next.slice(-500) : next;
          });
        }
      } catch (_) {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => { es.close(); };
  }, [fetchStats]);

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

  const articleProcessing = ARTICLE_STAGES.reduce((sum, s) => sum + (articleStats[s.id] ?? 0), 0);
  const bottleneck = ARTICLE_STAGES.reduce<{ id: string; count: number } | null>((best, s) => {
    const c = articleStats[s.id] ?? 0;
    return c > (best?.count ?? 0) ? { id: s.id, count: c } : best;
  }, null);

  const batchDoneEvents = events.filter((e) => e.type === "batch_done").slice(-50);

  const activeBatchesByStage = (pipeline: string, stageId: string) =>
    Array.from(activeBatches.values()).filter((b) => b.pipeline === pipeline && b.stage === stageId);

  const stepsByStage = (stageId: string) => stepEvents.filter((e) => e.stage === stageId);

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

        {/* Controls */}
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

        {/* Summary card */}
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

        {/* Article Pipeline */}
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
                  stage={stage} count={count} isActive={isActive} activeBatches={batches}
                  isBottleneck={isBottleneck} isDone={false}
                  onClick={() => setDrawerStage(`article:${stage.id}`)} liveSteps={stepsByStage(stage.id)}
                />
                {!isLast && <Connector active={count === 0} />}
              </div>
            );
          })}
        </div>

        {/* Outcomes */}
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

        {/* Live Activity Feed */}
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

      {/* Stage Detail Drawer */}
      {drawerStage && (() => {
        const [pipeline, stageId] = drawerStage.split(":") as [string, string];
        const stageDef = [...ARTICLE_STAGES, ...VIDEO_STAGES].find((s) => s.id === stageId);
        const stageSteps = stepsByStage(stageId);
        const stageActiveBatches = activeBatchesByStage(pipeline, stageId);
        const count = pipeline === "article" ? (articleStats[stageId] ?? 0) : (videoStats[stageId] ?? 0);
        return (
          <PipelineStageDrawer
            stageId={stageId} pipeline={pipeline} stageDef={stageDef} count={count}
            isActive={stageActiveBatches.length > 0} activeBatches={stageActiveBatches}
            liveSteps={stageSteps} onClose={() => setDrawerStage(null)}
            channelId={channelId}
          />
        );
      })()}
    </div>
  );
}

/* ─── Stage Node ─── */

function StageNode({
  stage, count, isActive, activeBatches, isBottleneck, isDone, onClick, liveSteps = [],
}: {
  stage: { id: string; label: string; icon: typeof FileText; color: string; bg: string };
  count: number; isActive: boolean; activeBatches: BatchEvent[]; isBottleneck: boolean;
  isDone: boolean; onClick: () => void; liveSteps?: BatchEvent[];
}) {
  const Icon = stage.icon;
  const isEmpty = count === 0 && !isActive;

  return (
    <button
      onClick={onClick}
      className={`w-full max-w-[340px] rounded-xl border-2 px-4 py-3 text-left transition-all hover:ring-4 hover:scale-[1.02] ${
        isBottleneck ? `border-current ${stage.color} ${stage.bg}/10 ring-current/20`
        : isActive ? "border-primary/40 bg-card ring-primary/20"
        : isEmpty ? "border-border/50 bg-card" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-3">
        {isActive ? (
          <Loader2 className="w-5 h-5 text-primary shrink-0 animate-spin" />
        ) : (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isDone ? "bg-success/15" : isBottleneck ? `${stage.bg}/15` : "bg-card"
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
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {liveSteps.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-1">
          {(() => {
            const byStep = new Map<string, BatchEvent>();
            for (const s of liveSteps) { if (s.step) byStep.set(s.step, s); }
            return Array.from(byStep.values()).map((s) => {
              const isOk = s.status === "ok" || s.status === "created" || s.status === "linked";
              const isFail = s.status === "failed" || s.status === "parse_error";
              return (
                <span key={s.step} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                  isOk ? "bg-success/5 border-success/20 text-success"
                  : isFail ? "bg-destructive/5 border-destructive/20 text-destructive"
                  : "bg-primary/5 border-primary/20 text-primary"
                }`}>
                  {isOk ? <CheckCircle2 className="w-2.5 h-2.5" /> : isFail ? <AlertTriangle className="w-2.5 h-2.5" /> : <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {s.label || s.step}
                </span>
              );
            });
          })()}
        </div>
      )}
    </button>
  );
}

function Connector({ active }: { active: boolean }) {
  return <div className="flex flex-col items-center"><div className={`w-px h-8 ${active ? "bg-border" : "bg-border/30"}`} /></div>;
}

function OutcomeNode({ label, count, color, bg, icon: Icon }: {
  label: string; count: number; color: string; bg: string; icon: typeof CheckCircle2;
}) {
  return (
    <div className={`w-full max-w-[340px] rounded-xl border-2 px-4 py-3 ${
      count > 0 ? "border-success/40 bg-card" : "border-border/50 bg-card opacity-40"
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

/* ─── Stage Drawer (with persistent batch history) ─── */

const STAGE_STEPS: Record<string, { step: string; label: string; subtitle: string; icon: typeof FileText }[]> = {
  transcript: [
    { step: "transcript_fetch", label: "Transcript", subtitle: "Fetch YouTube video transcript", icon: FileText },
  ],
  story_count: [
    { step: "story_count", label: "Story Count", subtitle: "Server-side multi-story detection", icon: Hash },
  ],
  story_split: [
    { step: "story_split", label: "Story Split", subtitle: "AI splits transcript into stories", icon: Layers },
  ],
  imported: [
    { step: "imported", label: "Imported", subtitle: "Queued for ingestion", icon: Download },
  ],
  content: [
    { step: "apify_content", label: "Apify Content", subtitle: "Article body from Apify actor", icon: FileText },
    { step: "firecrawl", label: "Firecrawl", subtitle: "Scraped via Firecrawl API", icon: Globe },
    { step: "html_fetch", label: "HTML Fetch", subtitle: "Fallback HTTP fetch", icon: Globe },
  ],
  classify: [
    { step: "classify", label: "Classified", subtitle: "Topic, tags, region, sentiment", icon: Brain },
  ],
  title_translate: [
    { step: "title_translate", label: "Title Translate", subtitle: "Arabic title + summary for scoring", icon: Languages },
  ],
  score: [
    { step: "score_similarity", label: "Competition Match", subtitle: "Match vs. existing stories", icon: Target },
    { step: "score_topic_demand", label: "Topic Demand", subtitle: "Competitor audience engagement", icon: Users },
    { step: "score_niche", label: "Niche Fit", subtitle: "Channel niche relevance", icon: Target },
    { step: "score_ai_analysis", label: "AI Scoring", subtitle: "Relevance & viral scores", icon: Brain },
    { step: "score", label: "Final Score", subtitle: "Composite score", icon: Sparkles },
    { step: "threshold_gate", label: "Threshold Gate", subtitle: "Dynamic score threshold check", icon: Target },
  ],
  research: [
    { step: "research_decision", label: "Decision", subtitle: "Whether research is needed", icon: Target },
    { step: "serpapi_search", label: "Web Search", subtitle: "Related news via Google Search", icon: Search },
    { step: "images", label: "Image Search", subtitle: "SerpAPI Google Images", icon: ImageIcon },
    { step: "perplexity_context", label: "Background", subtitle: "Context from Perplexity", icon: Globe },
    { step: "synthesis", label: "Synthesis", subtitle: "AI brief (hook, narrative, facts)", icon: Brain },
  ],
  translated: [
    { step: "detect_language", label: "Language", subtitle: "Detect source language", icon: Languages },
    { step: "translate_content", label: "Translate Content", subtitle: "Article text → Arabic", icon: Languages },
    { step: "translate_analysis", label: "Translate Fields", subtitle: "Classification fields → Arabic", icon: Brain },
    { step: "translate_research", label: "Translate Brief", subtitle: "Research brief → Arabic", icon: Search },
  ],
  import: [{ step: "import", label: "Import Video", subtitle: "Queue video for processing", icon: Download }],
  transcribe: [{ step: "transcribe", label: "Transcribe", subtitle: "YouTube transcript extraction", icon: Youtube }],
  comments: [{ step: "comments", label: "Comments", subtitle: "Fetch YouTube comments", icon: FileText }],
  analyzing: [{ step: "analyzing", label: "Analyzing", subtitle: "AI analysis of video content", icon: Brain }],
};

function PipelineStageDrawer({
  stageId, pipeline, stageDef, count, isActive, activeBatches, liveSteps, onClose, channelId,
}: {
  stageId: string; pipeline: string;
  stageDef?: { id: string; label: string; icon: typeof FileText; color: string; bg: string };
  count: number; isActive: boolean; activeBatches: BatchEvent[];
  liveSteps: BatchEvent[]; onClose: () => void; channelId?: string;
}) {
  const Icon = stageDef?.icon ?? FileText;
  const color = stageDef?.color ?? "text-muted-foreground";
  const stepsSpec = STAGE_STEPS[stageId] || [];

  // Persistent batch history from API
  const [batches, setBatches] = useState<ApiBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<Record<string, ApiBatchDetail | null>>({});
  const [itemsLoading, setItemsLoading] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Fetch batch history on mount + poll every 15s
  const fetchBatches = useCallback(() => {
    const params = new URLSearchParams({ stage: stageId, pipeline });
    if (channelId) params.set("channelId", channelId);
    fetch(`/api/article-pipeline/batches?${params}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setBatches(data))
      .catch(() => {})
      .finally(() => setBatchesLoading(false));
  }, [stageId, pipeline, channelId]);

  useEffect(() => {
    fetchBatches();
    const timer = setInterval(fetchBatches, 15_000);
    return () => clearInterval(timer);
  }, [fetchBatches]);

  // Fetch items when expanding a batch
  const toggleBatch = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      return;
    }
    setExpandedBatch(batchId);
    if (batchItems[batchId]) return;

    setItemsLoading(batchId);
    fetch(`/api/article-pipeline/batches/${batchId}/items`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: ApiBatchDetail) => setBatchItems((prev) => ({ ...prev, [batchId]: data })))
      .catch(() => setBatchItems((prev) => ({ ...prev, [batchId]: null })))
      .finally(() => setItemsLoading(null));
  };

  const stepStatusMap = new Map<string, BatchEvent>();
  for (const s of liveSteps) { if (s.step) stepStatusMap.set(s.step, s); }

  const byArticle = new Map<string, BatchEvent[]>();
  for (const s of liveSteps) {
    const key = s.articleId || "unknown";
    if (!byArticle.has(key)) byArticle.set(key, []);
    byArticle.get(key)!.push(s);
  }
  const articleEntries = Array.from(byArticle.entries());

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[640px] bg-background border-l border-border overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stageDef?.bg ?? "bg-card"}/15`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">{stageDef?.label ?? stageId}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase">{pipeline}</span>
                {count > 0 && <span className="text-[10px] font-mono text-foreground">{count} queued</span>}
                {isActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-primary animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processing
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-card border border-border transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Sub-steps */}
        {stepsSpec.length > 0 && (
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
              <Zap className="w-3 h-3" />
              <span>Sub-steps ({stepsSpec.length})</span>
            </div>
            {stepsSpec.map((spec) => {
              const live = stepStatusMap.get(spec.step);
              const StepIcon = spec.icon;
              const status = live?.status;
              const isOk = status === "ok" || status === "created" || status === "linked";
              const isFail = status === "failed" || status === "parse_error";
              const isSkipped = status === "skipped";
              const isPending = !live;
              return (
                <div key={spec.step} className={`px-3 py-2.5 rounded-lg border space-y-1 ${
                  isPending ? "bg-card/20 border-border/50 opacity-50"
                  : isOk ? "bg-card/50 border-success/20"
                  : isFail ? "bg-card/50 border-destructive/20"
                  : isSkipped ? "bg-card/20 border-border/50 opacity-60"
                  : "bg-card/50 border-primary/20"
                }`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StepIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-semibold">{spec.label}</span>
                    {live?.processor && <ProcessorBadge type={live.processor} />}
                    {live?.service && <span className="text-[9px] font-mono text-muted-foreground">{live.service}</span>}
                    {status && <StatusBadge status={status} />}
                    {isPending && <span className="text-[9px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-card">pending</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono leading-tight pl-5.5">{spec.subtitle}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Currently processing (live) */}
        {(activeBatches.length > 0 || articleEntries.length > 0) && (
          <div className="px-5 py-4 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Currently Processing</span>
            </div>
            {activeBatches.map((b) => (
              <div key={b.batchId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                <span className="text-[11px] font-mono text-primary font-semibold">Batch #{b.batchId}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{b.count} items</span>
              </div>
            ))}
            {articleEntries.slice(0, 10).map(([artId, artSteps]) => (
              <div key={artId} className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">…{artId.slice(-8)}</span>
                  <span className="text-[9px] font-mono text-muted-foreground/50">{artSteps.length} steps</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {artSteps.map((s, i) => {
                    const isOk = s.status === "ok" || s.status === "created" || s.status === "linked";
                    const isFail = s.status === "failed" || s.status === "parse_error";
                    return (
                      <span key={`${s.step}-${i}`} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                        isOk ? "bg-success/5 border-success/20 text-success"
                        : isFail ? "bg-destructive/5 border-destructive/20 text-destructive"
                        : "bg-primary/5 border-primary/20 text-primary"
                      }`}>
                        {isOk ? <CheckCircle2 className="w-2.5 h-2.5" /> : isFail ? <AlertTriangle className="w-2.5 h-2.5" /> : <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        {s.label || s.step}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Persistent Batch History ═══ */}
        <div className="px-5 py-4 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
            <RotateCw className={`w-3 h-3 ${batchesLoading ? "animate-spin" : ""}`} />
            <span>Batch History ({batches.length})</span>
          </div>

          {batchesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-[11px] text-muted-foreground font-mono text-center py-8">
              No batches recorded yet for this stage
            </div>
          ) : (
            <div className="space-y-1.5">
              {batches.map((batch) => {
                const isExpanded = expandedBatch === batch.id;
                const detail = batchItems[batch.id];
                const isLoadingItems = itemsLoading === batch.id;
                const pct = batch.itemCount > 0 ? Math.round((batch.succeededCount / batch.itemCount) * 100) : 0;
                const statusColor = batch.failedCount === 0 ? "text-success" : batch.succeededCount === 0 ? "text-destructive" : "text-orange";
                const statusBg = batch.failedCount === 0 ? "bg-success" : batch.succeededCount === 0 ? "bg-destructive" : "bg-orange";

                return (
                  <div key={batch.id} className="rounded-lg border border-border/50 overflow-hidden">
                    {/* Batch header — clickable */}
                    <button
                      onClick={() => toggleBatch(batch.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-card/50 transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}

                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-muted-foreground">#{batch.batchSeq}</span>

                        {/* Progress bar */}
                        <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden shrink-0">
                          <div className={`h-full ${statusBg} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>

                        <span className={`text-[11px] font-mono font-semibold ${statusColor}`}>
                          {batch.succeededCount}/{batch.itemCount}
                        </span>

                        {batch.failedCount > 0 && (
                          <span className="text-[10px] font-mono text-destructive">
                            {batch.failedCount} failed
                          </span>
                        )}

                        {batch.catchup && (
                          <span className="text-[9px] font-mono text-orange px-1.5 py-0.5 rounded bg-orange/10">catch-up</span>
                        )}
                      </div>

                      <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                        {batch.finishedAt ? fmtAgo(new Date(batch.finishedAt).getTime()) : "running…"}
                      </span>
                    </button>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="border-t border-border/30 bg-card/20">
                        {isLoadingItems ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : detail ? (
                          <div className="divide-y divide-border/30">
                            {detail.items.map((item) => (
                              <BatchItemRow key={item.id} item={item} />
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground font-mono text-center py-4">
                            Failed to load items
                          </div>
                        )}
                      </div>
                    )}
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

/* ─── Batch Item Row ─── */

function BatchItemRow({ item }: { item: ApiBatchItem }) {
  const [expanded, setExpanded] = useState(false);
  const isOk = item.status === "succeeded";
  const isFail = item.status === "failed";
  const isBlocked = item.status === "blocked";
  const isReview = item.status === "review";
  const hasSteps = item.steps && item.steps.length > 0;

  const statusIcon = isOk ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
    : isFail ? <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
    : isBlocked ? <ShieldAlert className="w-3 h-3 text-orange shrink-0" />
    : isReview ? <AlertTriangle className="w-3 h-3 text-orange shrink-0" />
    : <Circle className="w-3 h-3 text-muted-foreground shrink-0" />;

  const title = item.article?.title || item.article?.url || item.articleId;
  const displayTitle = typeof title === "string" && title.length > 60 ? title.slice(0, 60) + "…" : title;

  return (
    <div>
      <button
        onClick={() => hasSteps && setExpanded(!expanded)}
        className={`w-full px-3 py-2 flex items-start gap-2 text-left ${hasSteps ? "hover:bg-card/40 cursor-pointer" : ""} transition-colors`}
      >
        {hasSteps ? (
          expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <div className="mt-0.5">{statusIcon}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {hasSteps && <div className="shrink-0">{statusIcon}</div>}
            <span className="text-[11px] font-medium text-foreground truncate">{displayTitle}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.article && (
              <span className="text-[9px] font-mono text-muted-foreground">
                → {item.article.stage} · {item.article.status}
              </span>
            )}
            {item.durationMs != null && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/60">
                <Clock className="w-2.5 h-2.5" />
                {item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {item.attempt > 1 && (
              <span className="text-[9px] font-mono text-orange px-1 py-0.5 rounded bg-orange/10">
                attempt {item.attempt}
              </span>
            )}
            {hasSteps && !expanded && (
              <span className="text-[9px] font-mono text-muted-foreground/40">
                {item.steps.length} steps
              </span>
            )}
          </div>
          {item.error && !expanded && (
            <div className="text-[10px] font-mono text-destructive/80 mt-1 leading-tight">
              {item.error.length > 120 ? item.error.slice(0, 120) + "…" : item.error}
            </div>
          )}
        </div>
      </button>

      {expanded && hasSteps && (
        <div className="ml-6 mr-3 mb-2 space-y-0.5">
          {item.steps.map((step, i) => {
            const stepOk = step.status === "ok" || step.status === "created" || step.status === "linked";
            const stepFail = step.status === "failed" || step.status === "parse_error";
            const stepSkip = step.status === "skipped";
            return (
              <div key={`${step.step}-${i}`} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[10px] font-mono ${
                stepOk ? "bg-success/5 text-success/90"
                : stepFail ? "bg-destructive/5 text-destructive/90"
                : stepSkip ? "bg-card/30 text-muted-foreground/50"
                : "bg-primary/5 text-primary/90"
              }`}>
                {stepOk ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                  : stepFail ? <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  : stepSkip ? <Circle className="w-2.5 h-2.5 shrink-0" />
                  : <Loader2 className="w-2.5 h-2.5 shrink-0" />}
                <span className="font-semibold">{step.label || step.step}</span>
                {step.processor && <ProcessorBadge type={step.processor} />}
                {step.service && <span className="text-muted-foreground/60">{step.service}</span>}
                {step.error && (
                  <span className="text-destructive/70 truncate max-w-[200px]">{step.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Shared Badges ─── */

function ProcessorBadge({ type }: { type: string }) {
  const style = type === "ai" ? "bg-purple/10 text-purple border-purple/20"
    : type === "api" ? "bg-primary/10 text-primary border-primary/20"
    : "bg-card text-muted-foreground border-border";
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${style}`}>{type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok" || status === "created" || status === "linked";
  const isFail = status === "failed" || status === "parse_error";
  const isSkipped = status === "skipped";
  const style = isOk ? "bg-success/10 text-success border-success/20"
    : isFail ? "bg-destructive/10 text-destructive border-destructive/20"
    : isSkipped ? "bg-card text-muted-foreground border-border"
    : "bg-orange/10 text-orange border-orange/20";
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${style}`}>{status}</span>;
}

/* ─── Helpers ─── */

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
