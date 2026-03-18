import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import { fmtDateTime } from "@/lib/utils";
import {
  RotateCw, Pause, Play, Circle, AlertTriangle, ExternalLink,
  SkipForward, Trash2, ClipboardPaste, X, Loader2, CheckCircle2,
  ArrowRight, Globe, Languages, Brain, Sparkles, FileText, Download,
  Zap, TrendingUp, Bell, Search, Activity, Target, FlaskConical,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

/* ─── Types ─── */

interface LogEntry {
  step: string;
  status?: string;
  source?: string;
  chars?: number;
  threshold?: number;
  error?: string;
  reason?: string;
  detected?: string;
  model?: string;
  inputLang?: string;
  inputChars?: number;
  outputChars?: number;
  topic?: string;
  tags?: string[];
  sentiment?: string;
  contentType?: string;
  region?: string;
  relevance?: number;
  viralPotential?: number;
  freshness?: number;
  preferenceBias?: number;
  rankScore?: number;
  storyId?: string | null;
  at?: string;
  needed?: boolean;
  resultsCount?: number;
  titles?: string[];
  citations?: number;
  briefKeys?: string[];
  narrativeStrength?: number;
  hasBrief?: boolean;
  query?: string;
  matchCount?: number;
}

interface Analysis {
  topic?: string;
  tags?: string[];
  sentiment?: string;
  contentType?: string;
  region?: string;
  viralPotential?: number;
  relevance?: number;
  summary?: string;
  isBreaking?: boolean;
  uniqueAngle?: string;
  parseError?: boolean;
}

interface ArticleSource {
  id: string;
  label: string;
  type: string;
  language: string;
}

interface ApiArticle {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  stage: string;
  status: string;
  error: string | null;
  retries: number;
  startedAt: string | null;
  finishedAt: string | null;
  publishedAt: string | null;
  language: string | null;
  relevanceScore: number | null;
  rankScore: number | null;
  rankReason: string | null;
  storyId: string | null;
  createdAt: string;
  updatedAt: string;
  processingLog?: LogEntry[] | null;
  analysis?: Analysis | null;
  source?: ArticleSource | null;
}

interface PipelineData {
  stats: Record<string, number>;
  byStage: Record<string, ApiArticle[]>;
  paused: boolean;
}

interface VectorIntelligenceData {
  hasEmbeddingKey: boolean;
  lastStatsRefreshAt: string | null;
  rescoreIntervalHours: number;
  embeddings: {
    videos: { total: number; embedded: number };
    stories: { total: number; embedded: number };
  };
  rescoreStats: { total: number; rescored: number };
  scoreProfile: {
    totalOutcomes: number;
    totalDecisions: number;
    aiViralAccuracy: number;
    aiRelevanceAccuracy: number;
    channelAvgViews: string;
    tagSignals: Record<string, number> | null;
    contentTypeSignals: Record<string, number> | null;
    regionSignals: Record<string, number> | null;
    lastLearnedAt: string | null;
  } | null;
  alerts: {
    items: Array<{ id: string; type: string; title: string; detail: unknown; storyId: string | null; isRead: boolean; createdAt: string }>;
    unreadCount: number;
  };
  recentRescores: Array<{
    id: string; headline: string; compositeScore: number; lastRescoredAt: string | null;
    latestEntry: {
      before: Record<string, number>;
      after: Record<string, number>;
      factors: Record<string, unknown>;
      trigger: string;
    } | null;
  }>;
  topSimilarity: Array<{
    id: string; headline: string; competitionMatches: number;
    viralBoost: number; freshness: number; compositeScore: number;
  }>;
}

/* ─── Sub-step column definitions ─── */

interface SubStep {
  id: string;
  label: string;
  icon: typeof FileText;
  color: string;
  parentStage: string;
  filterFn: (a: ApiArticle) => boolean;
}

const SUB_STEPS: SubStep[] = [
  // Content sub-steps
  {
    id: "apify_content", label: "Apify Content", icon: FileText, color: "text-orange",
    parentStage: "content",
    filterFn: (a) => {
      const log = getLogStep(a, "content_source");
      return log?.source === "apify";
    },
  },
  {
    id: "firecrawl", label: "Firecrawl", icon: Globe, color: "text-blue",
    parentStage: "content",
    filterFn: (a) => {
      const log = getLogStep(a, "content_source");
      return log?.source === "firecrawl_or_html" && hasLogStep(a, "firecrawl", "ok");
    },
  },
  {
    id: "html_fetch", label: "HTML Fetch", icon: Globe, color: "text-purple",
    parentStage: "content",
    filterFn: (a) => {
      const log = getLogStep(a, "content_source");
      return log?.source === "firecrawl_or_html" && !hasLogStep(a, "firecrawl", "ok");
    },
  },
  {
    id: "title_desc", label: "Title+Desc", icon: FileText, color: "text-dim",
    parentStage: "content",
    filterFn: (a) => {
      const log = getLogStep(a, "content_source");
      return log?.source === "title_desc_fallback";
    },
  },
  // Classify sub-steps (runs on original language)
  {
    id: "classify_result", label: "Classified", icon: Brain, color: "text-success",
    parentStage: "classify",
    filterFn: (a) => hasLogStep(a, "classify"),
  },
  // Research sub-steps (runs on original language)
  {
    id: "research_decision", label: "Decision", icon: Target, color: "text-purple",
    parentStage: "research",
    filterFn: (a) => hasLogStep(a, "research_decision"),
  },
  {
    id: "firecrawl_search", label: "Web Search", icon: Search, color: "text-blue",
    parentStage: "research",
    filterFn: (a) => hasLogStep(a, "firecrawl_search", "ok"),
  },
  {
    id: "perplexity_context", label: "Background", icon: Globe, color: "text-orange",
    parentStage: "research",
    filterFn: (a) => hasLogStep(a, "perplexity_context", "ok"),
  },
  {
    id: "synthesis", label: "Synthesis", icon: Brain, color: "text-success",
    parentStage: "research",
    filterFn: (a) => hasLogStep(a, "synthesis", "ok"),
  },
  // Translated sub-steps (runs after research)
  {
    id: "lang_detect", label: "Language", icon: Languages, color: "text-purple",
    parentStage: "translated",
    filterFn: (a) => hasLogStep(a, "detect_language"),
  },
  {
    id: "translate_claude", label: "Translation", icon: Languages, color: "text-blue",
    parentStage: "translated",
    filterFn: (a) => {
      const log = getLogStep(a, "translate");
      return log?.status === "ok" || log?.status === "skipped";
    },
  },
  // Score & Promotion sub-steps (final stage)
  {
    id: "score", label: "Score", icon: Sparkles, color: "text-orange",
    parentStage: "score",
    filterFn: (a) => hasLogStep(a, "score"),
  },
  {
    id: "promote", label: "Story Created", icon: CheckCircle2, color: "text-success",
    parentStage: "score",
    filterFn: (a) => {
      const log = getLogStep(a, "promote");
      return log?.status === "created";
    },
  },
];

const STAGE_DEFS = [
  { id: "imported", label: "Imported", color: "text-orange", number: 1 },
  { id: "content", label: "Content", color: "text-blue", number: 2 },
  { id: "classify", label: "Classify", color: "text-success", number: 3 },
  { id: "research", label: "Research", color: "text-purple", number: 4 },
  { id: "translated", label: "Translated", color: "text-blue", number: 5 },
  { id: "score", label: "Score", color: "text-orange", number: 6 },
  { id: "review", label: "Review", color: "text-orange", number: 0 },
  { id: "failed", label: "Failed", color: "text-destructive", number: 0 },
];

function getLog(a: ApiArticle): LogEntry[] {
  return Array.isArray(a.processingLog) ? a.processingLog as LogEntry[] : [];
}
function getLogStep(a: ApiArticle, step: string): LogEntry | undefined {
  return getLog(a).findLast((e) => e.step === step);
}
function hasLogStep(a: ApiArticle, step: string, status?: string): boolean {
  const entries = getLog(a);
  return entries.some((e) => e.step === step && (status === undefined || e.status === status));
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const LANG_LABELS: Record<string, string> = {
  ar: "AR", en: "EN", es: "ES", fr: "FR", de: "DE", tr: "TR", zh: "ZH",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-success", negative: "text-destructive", neutral: "text-dim",
};

/* ─── Main Component ─── */

export default function ArticlePipeline() {
  const { projectId } = useParams();
  const pp = useProjectPath();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Vector Intelligence state
  const [vectorData, setVectorData] = useState<VectorIntelligenceData | null>(null);
  const [vectorLoading, setVectorLoading] = useState(true);
  const [reEvaluating, setReEvaluating] = useState(false);

  const fetchVectorIntelligence = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/vector-intelligence/status?projectId=${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setVectorData(d); })
      .catch(() => {})
      .finally(() => setVectorLoading(false));
  }, [projectId]);

  useEffect(() => { fetchVectorIntelligence(); }, [fetchVectorIntelligence]);

  const handleReEvaluate = () => {
    if (!projectId) return;
    setReEvaluating(true);
    fetch(`/api/stories/re-evaluate?projectId=${encodeURIComponent(projectId)}`, {
      method: "POST", credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        toast.success(`Re-evaluated ${d.evaluated} stories, ${d.changed} scores changed`);
        fetchVectorIntelligence();
      })
      .catch(() => toast.error("Re-evaluation failed"))
      .finally(() => setReEvaluating(false));
  };

  const fetchPipeline = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/article-pipeline?projectId=${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: PipelineData) => { setData(d); setPaused(d.paused); })
      .catch(() => toast.error("Failed to load article pipeline"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);
  useEffect(() => {
    setCountdown(30);
    const tick = setInterval(() => {
      setCountdown((p) => { if (p <= 1) { fetchPipeline(); return 30; } return p - 1; });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchPipeline]);

  const handlePauseResume = () => {
    const endpoint = paused ? "/api/article-pipeline/resume" : "/api/article-pipeline/pause";
    fetch(endpoint, { method: "POST", credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); setPaused(!paused); toast.success(paused ? "Resumed" : "Paused"); })
      .catch(() => toast.error("Failed"));
  };

  const handleRetryAll = () => {
    if (!projectId) return;
    setRetryingAll(true);
    fetch("/api/article-pipeline/retry-all-failed", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} failed`); fetchPipeline(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setRetryingAll(false));
  };

  const handleFetchAll = () => {
    if (!projectId) return;
    setFetchingAll(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { results: { label: string; inserted: number; fetched: number }[] }) => {
        const total = d.results.reduce((s, r) => s + (r.inserted || 0), 0);
        const fetched = d.results.reduce((s, r) => s + (r.fetched || 0), 0);
        toast.success(`Fetched ${fetched} articles, ${total} new`);
        fetchPipeline();
      })
      .catch(() => toast.error("Fetch failed"))
      .finally(() => setFetchingAll(false));
  };

  const handleTestRun = () => {
    if (!projectId) return;
    setTestRunning(true);
    fetch("/api/article-pipeline/test-run", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, limit: 5 }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { processed: number; results: { title: string; stage: string; after: string; status: string; error: string | null }[] }) => {
        const ok = d.results.filter(r => r.status !== "error").length;
        const failed = d.results.filter(r => r.status === "error").length;
        toast.success(`Test run: ${ok} processed${failed ? `, ${failed} errors` : ""}`);
        fetchPipeline();
      })
      .catch(() => toast.error("Test run failed"))
      .finally(() => setTestRunning(false));
  };

  const allArticles = data
    ? [...Object.values(data.byStage)].flat()
    : [];

  const doneArticles = data?.byStage?.done ?? [];
  const failedCount = data?.stats.failed ?? 0;
  const totalArticles = data?.stats.total ?? 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <h1 className="text-[13px] font-medium text-foreground">Article Pipeline</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
            paused ? "bg-orange/15 text-orange" : "bg-success/15 text-success"
          }`}>
            <Circle className="w-2 h-2 fill-current" />
            {paused ? "Paused" : `Running · ${countdown}s`}
          </span>
          <button onClick={handlePauseResume}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button onClick={handleTestRun} disabled={testRunning}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple/30 bg-purple/10 text-[11px] text-purple font-medium hover:bg-purple/20 transition-colors disabled:opacity-50">
            {testRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
            {testRunning ? "Running…" : "Test 5"}
          </button>
          <button onClick={handleFetchAll} disabled={fetchingAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
            {fetchingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Fetch All Sources
          </button>
          {failedCount > 0 && (
            <button onClick={handleRetryAll} disabled={retryingAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
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
                <StatBox label="Total" value={totalArticles} sub={`${(data?.stats.done ?? 0)} done`} />
                {STAGE_DEFS.filter(s => s.number > 0).map((s) => (
                  <StatBox key={s.id} label={s.label} value={data?.stats[s.id] ?? 0} color={s.color} />
                ))}
                <StatBox label="Review" value={data?.stats.review ?? 0} color="text-orange" />
                <StatBox label="Failed" value={failedCount} color="text-destructive" last />
              </div>
            </div>

            {/* ── 1. CONTENT FLOW ── */}
            <SectionHeader icon={FileText} title="Content Flow" subtitle="How articles get their text" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-1 items-start">
                <StageColumn stage={STAGE_DEFS[0]} items={data?.byStage.imported ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                {SUB_STEPS.filter(s => s.parentStage === "content").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
              </div>
              {(data?.byStage.content ?? []).length > 0 && (
                <div className="mt-3">
                  <StageColumn stage={STAGE_DEFS[1]} items={data?.byStage.content ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                </div>
              )}
            </div>

            {/* ── 2. CLASSIFY FLOW (original language) ── */}
            <SectionHeader icon={Brain} title="Classify Flow" subtitle="AI classification on original language content" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "classify").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
                {(data?.byStage.classify ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[2]} items={data?.byStage.classify ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 3. RESEARCH FLOW (original language) ── */}
            <SectionHeader icon={Search} title="Research Flow" subtitle="Web search and enrichment in the article's original language" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "research").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
              </div>
              {(data?.byStage.research ?? []).length > 0 && (
                <div className="mt-3">
                  <StageColumn stage={STAGE_DEFS[3]} items={data?.byStage.research ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                </div>
              )}
            </div>

            {/* ── 4. TRANSLATION FLOW (after research) ── */}
            <SectionHeader icon={Languages} title="Translation Flow" subtitle="Language detection and Arabic translation (after research)" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "translated").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
                {(data?.byStage.translated ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[4]} items={data?.byStage.translated ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 5. SCORE & PROMOTION ── */}
            <SectionHeader icon={Sparkles} title="Score & Promotion" subtitle="Scoring, ranking, and story creation with full data" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "score").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
                {(data?.byStage.score ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[5]} items={data?.byStage.score ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── VECTOR INTELLIGENCE FLOW ── */}
            <VectorIntelligenceSection
              data={vectorData}
              loading={vectorLoading}
              reEvaluating={reEvaluating}
              onReEvaluate={handleReEvaluate}
              pp={pp}
            />

            {/* ── REVIEW + FAILED ── */}
            {((data?.byStage.review ?? []).length > 0 || (data?.byStage.failed ?? []).length > 0) && (
              <>
                <SectionHeader icon={AlertTriangle} title="Needs Attention" subtitle="Review and failed articles" />
                <div className="px-6 max-lg:px-4 pb-8">
                  <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                    <StageColumn stage={STAGE_DEFS[6]} items={data?.byStage.review ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                    <StageColumn stage={STAGE_DEFS[7]} items={data?.byStage.failed ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Section Header ─── */

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof FileText; title: string; subtitle: string }) {
  return (
    <div className="px-6 max-lg:px-4 mb-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-dim" />
      <span className="text-[13px] font-semibold text-foreground">{title}</span>
      <span className="text-[11px] text-dim font-mono">— {subtitle}</span>
    </div>
  );
}

/* ─── Stat Box ─── */

function StatBox({ label, value, color, sub, last }: { label: string; value: number; color?: string; sub?: string; last?: boolean }) {
  return (
    <div className={`flex-1 px-4 py-3.5 bg-background ${!last ? "border-r border-border" : ""}`}>
      <div className={`text-xl font-semibold font-mono tracking-tight ${color || ""}`}>{value}</div>
      <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-dim font-mono mt-1">{sub}</div>}
    </div>
  );
}

/* ─── Sub-Step Column (completed articles grouped by how they were processed) ─── */

function SubStepColumn({
  sub, articles, onRefresh, projectId, pp,
}: {
  sub: SubStep; articles: ApiArticle[]; onRefresh: () => void; projectId: string | undefined; pp: (path: string) => string;
}) {
  const Icon = sub.icon;
  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: "400px" }}>
      <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${sub.color}`} />
          <span className="text-[12px] font-semibold">{sub.label}</span>
          <span className="text-[11px] text-dim font-mono">({articles.length})</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-background">
        {articles.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[11px] text-dim font-mono">—</div>
        ) : (
          articles.slice(0, 50).map((a) => (
            <DoneArticleRow key={a.id} article={a} subStep={sub} pp={pp} />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Done Article Row (shows rich sub-step detail) ─── */

function DoneArticleRow({ article, subStep, pp }: { article: ApiArticle; subStep: SubStep; pp: (path: string) => string }) {
  const domain = extractDomain(article.url);
  const log = getLog(article);
  const analysis = article.analysis as Analysis | null;
  const langLabel = LANG_LABELS[article.language || ""] || article.language || "";

  const contentSourceLog = log.find(e => e.step === "content_source");
  const translateLog = log.find(e => e.step === "translate");
  const detectLog = log.find(e => e.step === "detect_language");
  const classifyLog = log.find(e => e.step === "classify");
  const scoreLog = log.find(e => e.step === "score");
  const promoteLog = log.find(e => e.step === "promote");

  return (
    <Link to={pp(`/article/${article.id}`)} className="block px-3 py-2.5 border-t border-border hover:bg-surface/50 transition-colors group no-underline cursor-pointer">
      {/* Title row */}
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="text-[12px] text-foreground font-medium truncate flex-1" dir="auto">
          {article.title || domain || article.id.slice(0, 8)}
        </span>
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-dim hover:text-sensor" />
        </a>
      </div>

      {/* Sub-step specific detail */}
      {subStep.parentStage === "content" && contentSourceLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-dim">
          <span className={contentSourceLog.status === "ok" ? "text-success" : "text-destructive"}>
            {contentSourceLog.chars?.toLocaleString()} chars
          </span>
          {domain && <span>{domain}</span>}
        </div>
      )}

      {subStep.id === "lang_detect" && detectLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={`px-1.5 py-0.5 rounded font-bold ${
            detectLog.detected === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
          }`}>
            {(detectLog.detected || "?").toUpperCase()}
          </span>
          {translateLog?.status === "skipped" && (
            <span className="text-dim">Already Arabic</span>
          )}
          {translateLog?.status === "ok" && (
            <span className="text-blue">→ AR via Claude</span>
          )}
        </div>
      )}

      {subStep.id === "translate_claude" && translateLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-dim">
          {translateLog.status === "skipped" ? (
            <span className="text-success">Native Arabic</span>
          ) : (
            <>
              <span>{translateLog.inputChars?.toLocaleString()} → {translateLog.outputChars?.toLocaleString()} chars</span>
              <span className="text-blue">{translateLog.model}</span>
            </>
          )}
        </div>
      )}

      {subStep.id === "classify_result" && analysis && !analysis.parseError && (
        <div className="space-y-1">
          {analysis.topic && (
            <div className="text-[11px] text-foreground/80 truncate" dir="rtl">{analysis.topic}</div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {analysis.tags?.slice(0, 4).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-mono" dir="rtl">{tag}</span>
            ))}
            {(analysis.tags?.length || 0) > 4 && (
              <span className="text-[9px] text-dim">+{(analysis.tags?.length || 0) - 4}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {analysis.sentiment && (
              <span className={SENTIMENT_COLORS[analysis.sentiment] || "text-dim"}>{analysis.sentiment}</span>
            )}
            {analysis.contentType && (
              <span className="text-dim">{analysis.contentType}</span>
            )}
            {analysis.region && (
              <span className="text-dim" dir="rtl">{analysis.region}</span>
            )}
          </div>
        </div>
      )}

      {subStep.id === "score" && scoreLog && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <ScoreBar label="Rel" value={scoreLog.relevance} />
            <ScoreBar label="Viral" value={scoreLog.viralPotential} />
            <ScoreBar label="Fresh" value={scoreLog.freshness} />
          </div>
          {(scoreLog.preferenceBias ?? 0) !== 0 && (
            <div className="text-[10px] font-mono">
              <span className={scoreLog.preferenceBias! > 0 ? "text-success" : "text-destructive"}>
                Pref: {scoreLog.preferenceBias! > 0 ? "+" : ""}{scoreLog.preferenceBias}
              </span>
            </div>
          )}
          <div className="text-[11px] font-mono font-semibold">
            Rank: <span className="text-success">{scoreLog.rankScore}</span>
          </div>
        </div>
      )}

      {subStep.id === "promote" && promoteLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {promoteLog.status === "created" && article.storyId ? (
            <Link to={pp(`/story/${article.storyId}`)} className="text-success hover:underline flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Story created
            </Link>
          ) : promoteLog.status === "linked" ? (
            <span className="text-dim">Linked to existing story</span>
          ) : promoteLog.status === "skipped" ? (
            <span className="text-dim">{promoteLog.reason}</span>
          ) : (
            <span className="text-destructive">{promoteLog.error || "Failed"}</span>
          )}
          {article.rankScore != null && (
            <span className="text-dim ml-auto">Score: {article.rankScore.toFixed(2)}</span>
          )}
        </div>
      )}

      {subStep.id === "research_decision" && (() => {
        const decision = log.find(e => e.step === "research_decision");
        if (!decision) return null;
        return (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={decision.needed ? "text-success" : "text-dim"}>
              {decision.needed ? "Research needed" : "Skipped"}
            </span>
            <span className="text-dim truncate">{decision.reason}</span>
          </div>
        );
      })()}

      {subStep.id === "firecrawl_search" && (() => {
        const fcLog = log.find(e => e.step === "firecrawl_search" && e.status === "ok");
        if (!fcLog) return null;
        return (
          <div className="space-y-1">
            <div className="text-[10px] font-mono text-blue">
              {(fcLog as any).resultsCount ?? 0} related articles found
            </div>
            {(fcLog as any).titles?.slice(0, 2).map((t: string, i: number) => (
              <div key={i} className="text-[10px] text-dim truncate">• {t}</div>
            ))}
          </div>
        );
      })()}

      {subStep.id === "perplexity_context" && (() => {
        const pxLog = log.find(e => e.step === "perplexity_context" && e.status === "ok");
        if (!pxLog) return null;
        return (
          <div className="flex items-center gap-2 text-[10px] font-mono text-dim">
            <span className="text-orange">{(pxLog as any).chars?.toLocaleString() ?? 0} chars</span>
            <span>{(pxLog as any).citations ?? 0} citations</span>
          </div>
        );
      })()}

      {subStep.id === "synthesis" && (() => {
        const synLog = log.find(e => e.step === "synthesis" && e.status === "ok");
        if (!synLog) return null;
        return (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-success">Brief generated</span>
            <span className="text-dim">
              {(synLog as any).briefKeys?.length ?? 0} sections
            </span>
          </div>
        );
      })()}

      {/* Elapsed time + retries */}
      <div className="flex items-center justify-between text-[10px] text-dim font-mono mt-1">
        {(article.createdAt || article.startedAt) && (
          <span>⏱ {fmtElapsed(article.createdAt, article.finishedAt)}</span>
        )}
        {article.retries > 0 && <span>{article.retries} Retry</span>}
      </div>
    </Link>
  );
}

/* ─── Score Bar ─── */

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const v = typeof value === "number" ? value : 0;
  const pct = Math.round(v * 100);
  return (
    <div className="flex items-center gap-1">
      <span className="text-dim w-8 text-right">{label}</span>
      <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7">{v.toFixed(2)}</span>
    </div>
  );
}

/* ─── Stage Column (active processing items) ─── */

function StageColumn({
  stage, items, onRefresh, projectId, pp,
}: {
  stage: { id: string; number: number; label: string; color: string };
  items: ApiArticle[];
  onRefresh: () => void;
  projectId: string | undefined;
  pp: (path: string) => string;
}) {
  const isFailed = stage.id === "failed";
  const isReview = stage.id === "review";
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryAll = () => {
    if (!projectId) return;
    setRetryingAll(true);
    fetch("/api/article-pipeline/retry-all-failed", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Retrying"); onRefresh(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setRetryingAll(false));
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: "400px" }}>
      <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              isFailed ? "bg-destructive/15 text-destructive" :
              isReview ? "bg-orange/15 text-orange" :
              "bg-primary/15 text-primary"
            }`}>
              {isFailed ? <AlertTriangle className="w-3 h-3" /> : isReview ? "!" : stage.number}
            </span>
            <span className="text-[12px] font-semibold">{stage.label}</span>
            <span className="text-[11px] text-dim font-mono">({items.length})</span>
          </div>
          {isFailed && items.length > 0 && (
            <button onClick={handleRetryAll} disabled={retryingAll}
              className="text-[10px] text-dim font-mono hover:text-sensor disabled:opacity-50">
              <RotateCw className={`w-3 h-3 inline mr-1 ${retryingAll ? "animate-spin" : ""}`} />Retry all
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-background">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[11px] text-dim font-mono">Empty</div>
        ) : (
          items.map((a) => (
            <ActiveArticleRow key={a.id} article={a} isFailed={isFailed} isReview={isReview} onRefresh={onRefresh} pp={pp} />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Active Article Row (processing / review / failed items) ─── */

function ActiveArticleRow({
  article, isFailed, isReview, onRefresh, pp,
}: {
  article: ApiArticle; isFailed: boolean; isReview: boolean; onRefresh: () => void; pp: (path: string) => string;
}) {
  const [retrying, setRetrying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);

  const domain = extractDomain(article.url);
  const log = getLog(article);

  const handleAction = (url: string, setter: (v: boolean) => void, msg: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setter(true);
    fetch(url, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success(msg); onRefresh(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setter(false));
  };

  const handlePaste = () => {
    if (pasteText.trim().length < 50) { toast.error("Min 50 characters"); return; }
    setPasting(true);
    fetch(`/api/article-pipeline/${article.id}/content`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pasteText.trim() }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Saved"); setShowPaste(false); setPasteText(""); onRefresh(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setPasting(false));
  };

  // Show recent log entries as status breadcrumbs
  const recentSteps = log.slice(-3);

  return (
    <div className="px-3 py-2.5 border-t border-border hover:bg-surface/50 transition-colors group">
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {article.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />}
          {article.status === "queued" && <span className="w-1.5 h-1.5 rounded-full bg-dim/50 shrink-0" />}
          {isReview && <span className="w-1.5 h-1.5 rounded-full bg-orange shrink-0" />}
          {isFailed && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />}
          <Link to={pp(`/article/${article.id}`)} className="text-[12px] text-foreground font-medium truncate hover:text-blue transition-colors no-underline" dir="auto">
            {article.title || domain || article.id.slice(0, 8)}
          </Link>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-dim hover:text-sensor" />
        </a>
      </div>

      {/* Log breadcrumbs */}
      {recentSteps.length > 0 && (
        <div className="flex items-center gap-1 mb-1 overflow-hidden">
          {recentSteps.map((entry, i) => (
            <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono ${
              entry.status === "ok" || entry.status === "skipped" ? "bg-success/10 text-success" :
              entry.status === "failed" || entry.status === "parse_error" ? "bg-destructive/10 text-destructive" :
              "bg-dim/10 text-dim"
            }`}>
              {entry.step.replace(/_/g, " ")}
              {entry.chars != null && ` ${entry.chars}`}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {(isFailed || isReview) && article.error && (
        <div className="text-[10px] text-destructive/80 font-mono truncate mb-1">{article.error}</div>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between text-[10px] text-dim font-mono">
        <div className="flex items-center gap-2">
          {domain && <span>{domain}</span>}
          {article.language && (
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
              article.language === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
            }`}>{LANG_LABELS[article.language] || article.language}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(article.startedAt || article.createdAt) && (
            <span>⏱ {fmtElapsed(article.startedAt || article.createdAt)}</span>
          )}
          {article.retries > 0 && <span>{article.retries} Retry</span>}
          {(isFailed || isReview) && (
            <button onClick={handleAction(`/api/article-pipeline/${article.id}/retry`, setRetrying, "Retrying")}
              disabled={retrying} className="hover:text-sensor disabled:opacity-50">
              {retrying ? "…" : "Retry"}
            </button>
          )}
        </div>
      </div>

      {/* Review actions */}
      {isReview && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
          <button onClick={handleAction(`/api/article-pipeline/${article.id}/skip`, setSkipping, "Skipped")}
            disabled={skipping}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-blue border border-blue/20 bg-blue/5 hover:bg-blue/10 disabled:opacity-50">
            {skipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />} Skip
          </button>
          <button onClick={handleAction(`/api/article-pipeline/${article.id}/drop`, setDropping, "Dropped")}
            disabled={dropping}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 disabled:opacity-50">
            {dropping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Drop
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowPaste(!showPaste); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-purple border border-purple/20 bg-purple/5 hover:bg-purple/10">
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>
        </div>
      )}

      {showPaste && (
        <div className="mt-2 p-2.5 rounded-lg border border-purple/20 bg-purple/5">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste article content…"
            className="w-full h-20 bg-background border border-border rounded-lg p-2 text-[11px] font-mono resize-none focus:outline-none focus:border-purple/50" />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-dim font-mono">{pasteText.length} chars</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowPaste(false); setPasteText(""); }}
                className="text-[10px] text-dim font-mono hover:text-foreground"><X className="w-3 h-3 inline" /> Cancel</button>
              <button onClick={handlePaste} disabled={pasting || pasteText.trim().length < 50}
                className="px-2.5 py-1 rounded-md text-[10px] font-mono text-purple bg-purple/15 hover:bg-purple/25 disabled:opacity-50">
                {pasting ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Vector Intelligence Section ─── */

function VectorIntelligenceSection({
  data, loading, reEvaluating, onReEvaluate, pp,
}: {
  data: VectorIntelligenceData | null;
  loading: boolean;
  reEvaluating: boolean;
  onReEvaluate: () => void;
  pp: (path: string) => string;
}) {
  if (loading) return null;
  if (!data?.hasEmbeddingKey) {
    return (
      <>
        <SectionHeader icon={Zap} title="Vector Intelligence" subtitle="Semantic similarity, competition matching, and self-learning scores" />
        <div className="px-6 max-lg:px-4 mb-6">
          <div className="rounded-xl border border-border bg-background p-6 text-center">
            <Zap className="w-6 h-6 text-dim mx-auto mb-2" />
            <p className="text-[13px] text-dim">No OpenAI embedding key configured.</p>
            <p className="text-[11px] text-dim font-mono mt-1">Add your key in Settings → Vector Intelligence to enable.</p>
          </div>
        </div>
      </>
    );
  }

  const vEmb = data.embeddings.videos;
  const sEmb = data.embeddings.stories;
  const vPct = vEmb.total > 0 ? Math.round((vEmb.embedded / vEmb.total) * 100) : 0;
  const sPct = sEmb.total > 0 ? Math.round((sEmb.embedded / sEmb.total) * 100) : 0;
  const sp = data.scoreProfile;

  return (
    <>
      <div className="px-6 max-lg:px-4 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-dim" />
          <span className="text-[13px] font-semibold text-foreground">Vector Intelligence</span>
          <span className="text-[11px] text-dim font-mono">— Semantic similarity, competition matching, self-learning scores</span>
        </div>
        <button onClick={onReEvaluate} disabled={reEvaluating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple/30 bg-purple/10 text-purple text-[11px] font-semibold hover:bg-purple/20 transition-colors disabled:opacity-50">
          {reEvaluating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
          {reEvaluating ? "Re-evaluating…" : "Re-evaluate All"}
        </button>
      </div>
      <div className="px-6 max-lg:px-4 mb-6 space-y-3">

        {/* Stats row */}
        <div className="flex rounded-xl overflow-hidden border border-border">
          <VStatBox label="Videos Embedded" value={`${vEmb.embedded}/${vEmb.total}`} sub={`${vPct}%`} color="text-blue" />
          <VStatBox label="Stories Embedded" value={`${sEmb.embedded}/${sEmb.total}`} sub={`${sPct}%`} color="text-purple" />
          <VStatBox label="Stories Re-scored" value={data.rescoreStats.rescored} sub={`of ${data.rescoreStats.total}`} color="text-success" />
          <VStatBox label="Alerts" value={data.alerts.unreadCount} sub={`unread of ${data.alerts.items.length}`} color={data.alerts.unreadCount > 0 ? "text-orange" : "text-dim"} />
          <VStatBox label="Decisions Learned" value={sp?.totalDecisions ?? 0} color="text-foreground" />
          <VStatBox label="Outcomes Tracked" value={sp?.totalOutcomes ?? 0} color="text-foreground" />
          <VStatBox label="Last Refresh" value={data.lastStatsRefreshAt ? fmtShortAgo(data.lastStatsRefreshAt) : "Never"} sub={`every ${data.rescoreIntervalHours}h`} color="text-dim" last />
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">

          {/* Competition Intelligence */}
          <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: 420 }}>
            <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-orange" />
                <span className="text-[12px] font-semibold">Top Competition Matches</span>
                <span className="text-[11px] text-dim font-mono">({data.topSimilarity.length})</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-background">
              {data.topSimilarity.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-[11px] text-dim font-mono">No matches yet</div>
              ) : (
                data.topSimilarity.map((s) => (
                  <Link key={s.id} to={pp(`/story/${s.id}`)}
                    className="block px-3 py-2.5 border-t border-border hover:bg-surface/50 transition-colors">
                    <div className="text-[12px] text-foreground font-medium truncate mb-1" dir="auto">{s.headline}</div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-purple">
                        <Search className="w-2.5 h-2.5 inline mr-0.5" />{s.competitionMatches} matches
                      </span>
                      <span className={s.viralBoost > 5 ? "text-success" : "text-dim"}>
                        <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />viral +{s.viralBoost?.toFixed?.(1) ?? 0}
                      </span>
                      <span className="text-dim">score {s.compositeScore?.toFixed?.(1) ?? "—"}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Re-scores */}
          <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: 420 }}>
            <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-success" />
                <span className="text-[12px] font-semibold">Recent Score Changes</span>
                <span className="text-[11px] text-dim font-mono">({data.recentRescores.length})</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-background">
              {data.recentRescores.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-[11px] text-dim font-mono">No re-scores yet</div>
              ) : (
                data.recentRescores.map((s) => {
                  const before = s.latestEntry?.before?.compositeScore;
                  const after = s.latestEntry?.after?.compositeScore;
                  const delta = (before != null && after != null) ? after - before : null;
                  return (
                    <Link key={s.id} to={pp(`/story/${s.id}`)}
                      className="block px-3 py-2.5 border-t border-border hover:bg-surface/50 transition-colors">
                      <div className="text-[12px] text-foreground font-medium truncate mb-1" dir="auto">{s.headline}</div>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        {delta != null && (
                          <span className={delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-dim"}>
                            {before?.toFixed(1)} → {after?.toFixed(1)}
                            <span className="ml-1">({delta > 0 ? "+" : ""}{delta.toFixed(1)})</span>
                          </span>
                        )}
                        {s.lastRescoredAt && (
                          <span className="text-dim">{fmtShortAgo(s.lastRescoredAt)}</span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: 420 }}>
            <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-orange" />
                <span className="text-[12px] font-semibold">Intelligence Alerts</span>
                {data.alerts.unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-orange/15 text-orange text-[10px] font-mono font-semibold">
                    {data.alerts.unreadCount} new
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-background">
              {data.alerts.items.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-[11px] text-dim font-mono">No alerts</div>
              ) : (
                data.alerts.items.map((a) => (
                  <div key={a.id} className={`px-3 py-2.5 border-t border-border ${a.isRead ? "" : "bg-orange/[0.03]"}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {!a.isRead && <span className="w-1.5 h-1.5 rounded-full bg-orange shrink-0" />}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold ${
                        a.type === "score_change" ? "bg-purple/10 text-purple" :
                        a.type === "competitor_published" ? "bg-blue/10 text-blue" :
                        a.type === "trending_topic" ? "bg-success/10 text-success" :
                        "bg-dim/10 text-dim"
                      }`}>
                        {a.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground/80 truncate" dir="auto">{a.title}</div>
                    <div className="text-[10px] text-dim font-mono mt-0.5">{fmtShortAgo(a.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Learning Status */}
        {sp && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-3.5 h-3.5 text-purple" />
              <span className="text-[12px] font-semibold">Self-Learning Profile</span>
              {sp.lastLearnedAt && (
                <span className="text-[10px] text-dim font-mono">last learned {fmtShortAgo(sp.lastLearnedAt)}</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
              <LearningGauge label="AI Viral Accuracy" value={sp.aiViralAccuracy} />
              <LearningGauge label="AI Relevance Accuracy" value={sp.aiRelevanceAccuracy} />
              <div className="px-3 py-2 bg-surface rounded-lg">
                <div className="text-[10px] text-dim font-mono mb-0.5">Decisions</div>
                <div className="text-[14px] font-mono font-semibold">{sp.totalDecisions}</div>
              </div>
              <div className="px-3 py-2 bg-surface rounded-lg">
                <div className="text-[10px] text-dim font-mono mb-0.5">Outcomes</div>
                <div className="text-[14px] font-mono font-semibold">{sp.totalOutcomes}</div>
              </div>
            </div>
            {sp.contentTypeSignals && Object.keys(sp.contentTypeSignals).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-2">Learned Content Type Signals</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(sp.contentTypeSignals).map(([type, val]) => (
                    <span key={type} className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      (val as number) > 0 ? "bg-success/10 text-success" : (val as number) < 0 ? "bg-destructive/10 text-destructive" : "bg-dim/10 text-dim"
                    }`}>
                      {type}: {(val as number) > 0 ? "+" : ""}{typeof val === "number" ? val.toFixed(2) : val}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {sp.tagSignals && Object.keys(sp.tagSignals).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-2">Learned Tag Signals</div>
                <div className="flex flex-wrap gap-1.5" dir="rtl">
                  {Object.entries(sp.tagSignals).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 20).map(([tag, val]) => (
                    <span key={tag} className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      (val as number) > 0 ? "bg-success/10 text-success" : (val as number) < 0 ? "bg-destructive/10 text-destructive" : "bg-dim/10 text-dim"
                    }`}>
                      {tag}: {(val as number) > 0 ? "+" : ""}{typeof val === "number" ? val.toFixed(2) : val}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Vector Intelligence Helpers ─── */

function VStatBox({ label, value, sub, color, last }: { label: string; value: string | number; sub?: string; color?: string; last?: boolean }) {
  return (
    <div className={`flex-1 px-3 py-3 bg-background ${!last ? "border-r border-border" : ""}`}>
      <div className={`text-lg font-semibold font-mono tracking-tight ${color || ""}`}>{value}</div>
      <div className="text-[9px] text-dim font-mono uppercase tracking-wider mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-dim font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function LearningGauge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-success" : pct >= 50 ? "text-orange" : "text-destructive";
  const bgColor = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-orange" : "bg-destructive";
  return (
    <div className="px-3 py-2 bg-surface rounded-lg">
      <div className="text-[10px] text-dim font-mono mb-1">{label}</div>
      <div className={`text-[14px] font-mono font-semibold ${color}`}>{pct}%</div>
      <div className="w-full h-1 bg-border rounded-full mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtShortAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtElapsed(from: string | null | undefined, to?: string | null): string {
  if (!from) return "";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - start;
  if (ms < 0) return "";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
