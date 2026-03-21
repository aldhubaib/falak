import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useChannelPath } from "@/hooks/useChannelPath";
import SourceTab from "./Source";
import VectorIntelligenceTab from "./VectorIntelligence";
import { fmtDateTime } from "@/lib/utils";
import {
  RotateCw, Pause, Play, Circle, AlertTriangle, ExternalLink,
  SkipForward, Trash2, ClipboardPaste, X, Loader2, CheckCircle2,
  ArrowRight, Globe, Languages, Brain, Sparkles, FileText, Download,
  Search, Target, FlaskConical,
} from "lucide-react";
import { getFlowDef } from "@/constants/flowDefs";
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
  finalScore?: number;
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
  finalScore: number | null;
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

interface TestResultItem {
  id: string;
  title: string | null;
  stageBefore: string;
  stageAfter: string | null;
  currentStage: string;
  status: "pending" | "running" | "done" | "error";
  error: string | null;
}

/* ─── Sub-step column definitions ─── */

interface SubStep {
  id: string;
  label: string;
  subtitle: string;
  icon: typeof FileText;
  color: string;
  parentStage: string;
  filterFn: (a: ApiArticle) => boolean;
}

const SUB_STEPS: SubStep[] = [
  // Content sub-steps
  {
    id: "apify_content", label: "Apify Content", subtitle: "Article body from Apify actor",
    icon: FileText, color: "text-orange", parentStage: "content",
    filterFn: (a) => { const log = getLogStep(a, "content_source"); return log?.source === "apify"; },
  },
  {
    id: "firecrawl", label: "Firecrawl", subtitle: "Scraped via Firecrawl API",
    icon: Globe, color: "text-blue", parentStage: "content",
    filterFn: (a) => { const log = getLogStep(a, "content_source"); return log?.source === "firecrawl_or_html" && hasLogStep(a, "firecrawl", "ok"); },
  },
  {
    id: "html_fetch", label: "HTML Fetch", subtitle: "Fallback HTML fetch",
    icon: Globe, color: "text-purple", parentStage: "content",
    filterFn: (a) => { const log = getLogStep(a, "content_source"); return log?.source === "firecrawl_or_html" && !hasLogStep(a, "firecrawl", "ok"); },
  },
  {
    id: "title_desc", label: "Title+Desc", subtitle: "Title and description only",
    icon: FileText, color: "text-dim", parentStage: "content",
    filterFn: (a) => { const log = getLogStep(a, "content_source"); return log?.source === "title_desc_fallback"; },
  },
  {
    id: "classify_result", label: "Classified", subtitle: "Topic, tags, region, sentiment",
    icon: Brain, color: "text-success", parentStage: "classify",
    filterFn: (a) => hasLogStep(a, "classify"),
  },
  {
    id: "research_decision", label: "Decision", subtitle: "Whether research is needed",
    icon: Target, color: "text-purple", parentStage: "research",
    filterFn: (a) => hasLogStep(a, "research_decision"),
  },
  {
    id: "firecrawl_search", label: "Web Search", subtitle: "Related articles via search",
    icon: Search, color: "text-blue", parentStage: "research",
    filterFn: (a) => hasLogStep(a, "firecrawl_search", "ok"),
  },
  {
    id: "perplexity_context", label: "Background", subtitle: "Context from Perplexity",
    icon: Globe, color: "text-orange", parentStage: "research",
    filterFn: (a) => hasLogStep(a, "perplexity_context", "ok"),
  },
  {
    id: "synthesis", label: "Synthesis", subtitle: "AI brief (hook, narrative, facts)",
    icon: Brain, color: "text-success", parentStage: "research",
    filterFn: (a) => hasLogStep(a, "synthesis", "ok"),
  },
  {
    id: "research", label: "Research Complete", subtitle: "Research stage done",
    icon: Search, color: "text-success", parentStage: "research",
    filterFn: (a) => hasLogStep(a, "research"),
  },
  {
    id: "lang_detect", label: "Language", subtitle: "Detect source language",
    icon: Languages, color: "text-purple", parentStage: "translated",
    filterFn: (a) => hasLogStep(a, "detect_language"),
  },
  {
    id: "translate_content", label: "Translate Content", subtitle: "Article text → Arabic",
    icon: Languages, color: "text-blue", parentStage: "translated",
    filterFn: (a) => hasLogStep(a, "translate_content"),
  },
  {
    id: "translate_analysis", label: "Translate Fields", subtitle: "Classification fields → Arabic",
    icon: Brain, color: "text-blue", parentStage: "translated",
    filterFn: (a) => hasLogStep(a, "translate_analysis"),
  },
  {
    id: "translate_research", label: "Translate Brief", subtitle: "Research brief → Arabic",
    icon: Search, color: "text-blue", parentStage: "translated",
    filterFn: (a) => hasLogStep(a, "translate_research"),
  },
  {
    id: "score_similarity", label: "Competition Match", subtitle: "Match vs. existing stories",
    icon: Target, color: "text-purple", parentStage: "score",
    filterFn: (a) => hasLogStep(a, "score_similarity", "ok"),
  },
  {
    id: "score_ai_analysis", label: "AI Scoring", subtitle: "Relevance & viral scores",
    icon: Brain, color: "text-orange", parentStage: "score",
    filterFn: (a) => hasLogStep(a, "score_ai_analysis", "ok"),
  },
  {
    id: "score", label: "Final Score", subtitle: "Composite score",
    icon: Sparkles, color: "text-orange", parentStage: "score",
    filterFn: (a) => hasLogStep(a, "score"),
  },
  {
    id: "promote", label: "Story Created", subtitle: "Create or link story",
    icon: CheckCircle2, color: "text-success", parentStage: "promote",
    filterFn: (a) => { const log = getLogStep(a, "promote"); return log?.status === "created"; },
  },
];

const STAGE_DEFS = [
  { id: "imported", label: "Imported", subtitle: "Queued for ingestion", color: "text-orange", number: 1 },
  { id: "content", label: "Content", subtitle: "Fetching or processing content", color: "text-blue", number: 2 },
  { id: "classify", label: "Classify", subtitle: "Running classification", color: "text-success", number: 3 },
  { id: "research", label: "Research", subtitle: "Gathering context", color: "text-purple", number: 4 },
  { id: "translated", label: "Translated", subtitle: "Translating to Arabic", color: "text-blue", number: 5 },
  { id: "script", label: "Script", subtitle: "Generating draft script", color: "text-purple", number: 6 },
  { id: "score", label: "Score", subtitle: "Scoring & promotion", color: "text-orange", number: 7 },
  { id: "review", label: "Review", subtitle: "Needs manual review", color: "text-orange", number: 0 },
  { id: "failed", label: "Failed", subtitle: "Errors after retries", color: "text-destructive", number: 0 },
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

/** Log step id → display label (matches Kanban column titles exactly). */
const LOG_STEP_LABELS: Record<string, string> = {
  imported: "Imported",
  apify_content: "Apify Content",
  firecrawl: "Firecrawl",
  html_fetch: "HTML Fetch",
  content_source: "Content Source",
  title_desc: "Title+Desc",
  classify: "Classified",
  research_decision: "Decision",
  firecrawl_search: "Web Search",
  perplexity_context: "Background",
  synthesis: "Synthesis",
  research: "Research Complete",
  detect_language: "Language",
  translate_content: "Translate Content",
  translate_analysis: "Translate Fields",
  translate_research: "Translate Brief",
  score_similarity: "Competition Match",
  score_ai_analysis: "AI Scoring",
  score: "Final Score",
  promote: "Story Created",
};

/* ─── Tabs ─── */

const TABS = ["pipeline", "sources", "intelligence"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  pipeline: "Pipeline",
  sources: "Sources",
  intelligence: "Intelligence",
};

/* ─── Main Component ─── */

export default function ArticlePipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "pipeline";

  const setTab = (tab: Tab) => {
    setSearchParams(tab === "pipeline" ? {} : { tab }, { replace: true });
  };

  if (activeTab === "sources") return <ArticlePipelineShell activeTab={activeTab} setTab={setTab}><SourceTab /></ArticlePipelineShell>;
  if (activeTab === "intelligence") return <ArticlePipelineShell activeTab={activeTab} setTab={setTab}><VectorIntelligenceTab /></ArticlePipelineShell>;
  return <ArticlePipelineShell activeTab={activeTab} setTab={setTab}><PipelineTabContent /></ArticlePipelineShell>;
}

function ArticlePipelineShell({ activeTab, setTab, children }: { activeTab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center gap-0 px-6 border-b border-border shrink-0 max-lg:px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`relative h-full px-4 text-[13px] font-medium transition-colors ${
              activeTab === tab
                ? "text-foreground"
                : "text-dim hover:text-sensor"
            }`}
          >
            {TAB_LABELS[tab]}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

function PipelineTabContent() {
  const { channelId } = useParams();
  const pp = useChannelPath();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResultItem[] | null>(null);
  const [testProgress, setTestProgress] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchPipeline = useCallback(() => {
    if (!channelId) return;
    fetch(`/api/article-pipeline?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: PipelineData) => { setData(d); setPaused(d.paused); })
      .catch(() => toast.error("Failed to load article pipeline"))
      .finally(() => setLoading(false));
  }, [channelId]);

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
    if (!channelId) return;
    setRetryingAll(true);
    fetch("/api/article-pipeline/retry-all-failed", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} failed`); fetchPipeline(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setRetryingAll(false));
  };

  const handleFetchAll = () => {
    if (!channelId) return;
    setFetchingAll(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
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
    if (!channelId || testRunning) return;
    setTestRunning(true);
    setTestResults(null);
    setTestProgress("Starting…");

    fetch("/api/article-pipeline/test-run", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, limit: 1 }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { runId: string | null; total: number; articles: { id: string; title: string | null; stageBefore: string }[] }) => {
        if (!d.runId || d.total === 0) {
          toast("No queued articles to process");
          setTestRunning(false);
          setTestProgress(null);
          return;
        }

        setTestResults(d.articles.map(a => ({
          id: a.id, title: a.title, stageBefore: a.stageBefore,
          stageAfter: null, currentStage: a.stageBefore,
          status: "pending" as const, error: null,
        })));
        setTestProgress(`0 / ${d.total}`);

        // Poll for progress
        const poll = () => {
          fetch(`/api/article-pipeline/test-run/${d.runId}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((p: { total: number; completed: number; finished: boolean; currentlyProcessing: string | null; items: TestResultItem[] }) => {
              setTestResults(p.items);
              setTestProgress(p.finished ? null : `${p.completed} / ${p.total}${p.currentlyProcessing ? ` · ${p.currentlyProcessing}` : ""}`);

              if (p.finished) {
                setTestRunning(false);
                fetchPipeline();
                const ok = p.items.filter(i => i.status === "done").length;
                const errors = p.items.filter(i => i.status === "error").length;
                toast.success(`Test done: ${ok} processed${errors ? `, ${errors} errors` : ""}`);
              } else {
                setTimeout(poll, 2000);
              }
            })
            .catch(() => {
              setTestRunning(false);
              setTestProgress(null);
            });
        };
        setTimeout(poll, 1500);
      })
      .catch(() => {
        toast.error("Test run failed");
        setTestRunning(false);
        setTestProgress(null);
      });
  };

  const allArticles = data
    ? [...Object.values(data.byStage)].flat()
    : [];

  const failedCount = data?.stats.failed ?? 0;
  const totalArticles = data?.stats.total ?? 0;

  const articlesForSection = (parentStage: string): ApiArticle[] => {
    if (!data) return [];
    if (parentStage === "promote") return data.byStage.done ?? [];
    return data.byStage[parentStage] ?? [];
  };

  return (
    <>
      {/* Actions bar */}
      <div className="h-10 flex items-center justify-end px-6 border-b border-border shrink-0 max-lg:px-4">
        <div className="flex items-center gap-2">
          <button onClick={handlePauseResume}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              paused ? "bg-orange/15 text-orange hover:bg-orange/25" : "bg-success/15 text-success hover:bg-success/25"
            }`}>
            <Circle className="w-2 h-2 fill-current" />
            {paused ? "Paused" : `Running · ${countdown}s`}
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button
            onClick={handleTestRun}
            disabled={testRunning}
            title={paused ? "Run test on 1 article (works even when pipeline is paused)" : "Run test on 1 article"}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple/30 bg-purple/10 text-[11px] text-purple font-medium hover:bg-purple/20 transition-colors disabled:opacity-50">
            {testRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
            {testRunning ? (testProgress || "Running…") : "Test 1"}
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
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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

            {/* ── TEST RUN RESULTS ── */}
            {testResults && testResults.length > 0 && (
              <div className="px-6 max-lg:px-4 mb-5">
                <div className="rounded-xl border border-purple/30 bg-purple/[0.04] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-purple/20">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-3.5 h-3.5 text-purple" />
                      <span className="text-[12px] font-semibold text-foreground">Test Run Results</span>
                      <span className="text-[11px] text-dim font-mono">
                        {testResults.filter(r => r.status === "done").length} done
                        {testResults.some(r => r.status === "running") && (
                          <>, <span className="text-purple">{testResults.filter(r => r.status === "running").length} running</span></>
                        )}
                        {testResults.some(r => r.status === "pending") && (
                          <>, <span className="text-dim">{testResults.filter(r => r.status === "pending").length} waiting</span></>
                        )}
                        {testResults.some(r => r.status === "error") && (
                          <>, <span className="text-destructive">{testResults.filter(r => r.status === "error").length} errors</span></>
                        )}
                      </span>
                    </div>
                    {!testRunning && (
                      <button onClick={() => setTestResults(null)}
                        className="text-dim hover:text-foreground transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-purple/10">
                    {testResults.map((r, i) => (
                      <Link key={r.id || i} to={pp(`/article/${r.id}`)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-purple/[0.04] transition-colors group no-underline">
                        {/* Status indicator */}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          r.status === "running" ? "bg-purple/15 text-purple" :
                          r.status === "done" ? "bg-success/15 text-success" :
                          r.status === "error" ? "bg-destructive/15 text-destructive" :
                          "bg-dim/10 text-dim"
                        }`}>
                          {r.status === "running" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : r.status === "done" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : r.status === "error" ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <span>{i + 1}</span>
                          )}
                        </span>
                        {/* Title */}
                        <span className="text-[12px] text-foreground font-medium truncate flex-1 min-w-0" dir="auto">
                          {r.title || r.id?.slice(0, 12)}
                        </span>
                        {/* Stage transition */}
                        <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-dim/10 text-dim">{r.stageBefore}</span>
                          {r.status === "running" ? (
                            <>
                              <ArrowRight className="w-3 h-3 text-dim" />
                              <span className="px-1.5 py-0.5 rounded bg-purple/10 text-purple animate-pulse">
                                {r.currentStage}
                              </span>
                              <Loader2 className="w-3 h-3 text-purple animate-spin" />
                            </>
                          ) : r.stageAfter ? (
                            <>
                              <ArrowRight className="w-3 h-3 text-dim" />
                              <span className={`px-1.5 py-0.5 rounded ${
                                r.status === "error" ? "bg-destructive/10 text-destructive" :
                                r.stageAfter === "done" ? "bg-success/10 text-success" :
                                "bg-purple/10 text-purple"
                              }`}>
                                {r.stageAfter}
                              </span>
                            </>
                          ) : (
                            <span className="text-dim/50">waiting…</span>
                          )}
                        </div>
                        {r.error && (
                          <span className="text-[10px] text-destructive/70 font-mono truncate max-w-[200px]">{r.error}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── 1. IMPORTED ── */}
            <SectionHeader icon={getFlowDef("imported")!.icon} title={getFlowDef("imported")!.name} subtitle={getFlowDef("imported")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-1 gap-3 max-lg:grid-cols-1 items-start">
                <StageColumn stage={STAGE_DEFS[0]} items={data?.byStage.imported ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
              </div>
            </div>

            {/* ── 2. CONTENT ── */}
            <SectionHeader icon={getFlowDef("content")!.icon} title={getFlowDef("content")!.name} subtitle={getFlowDef("content")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "content").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
              </div>
              {(data?.byStage.content ?? []).length > 0 && (
                <div className="mt-3">
                  <StageColumn stage={STAGE_DEFS[1]} items={data?.byStage.content ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                </div>
              )}
            </div>

            {/* ── 3. CLASSIFY ── */}
            <SectionHeader icon={getFlowDef("classify")!.icon} title={getFlowDef("classify")!.name} subtitle={getFlowDef("classify")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "classify").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
                {(data?.byStage.classify ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[2]} items={data?.byStage.classify ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 4. RESEARCH ── */}
            <SectionHeader icon={getFlowDef("research")!.icon} title={getFlowDef("research")!.name} subtitle={getFlowDef("research")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "research" && ["research_decision", "firecrawl_search", "perplexity_context"].includes(s.id)).map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
              </div>
              {(data?.byStage.research ?? []).length > 0 && (
                <div className="mt-3">
                  <StageColumn stage={STAGE_DEFS[3]} items={data?.byStage.research ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                </div>
              )}
            </div>

            {/* ── 5. SYNTHESIS ── */}
            <SectionHeader icon={getFlowDef("synthesis")!.icon} title={getFlowDef("synthesis")!.name} subtitle={getFlowDef("synthesis")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "research" && ["synthesis", "research"].includes(s.id)).map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
              </div>
            </div>

            {/* ── 6. TRANSLATION ── */}
            <SectionHeader icon={getFlowDef("translated")!.icon} title={getFlowDef("translated")!.name} subtitle={getFlowDef("translated")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "translated").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
                {(data?.byStage.translated ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[4]} items={data?.byStage.translated ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 7. SCRIPT ── */}
            <SectionHeader icon={getFlowDef("script")!.icon} title={getFlowDef("script")!.name} subtitle={getFlowDef("script")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-1 gap-3 max-lg:grid-cols-1 items-start">
                {(data?.byStage.script ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[5]} items={data?.byStage.script ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 8. SCORE ── */}
            <SectionHeader icon={getFlowDef("score")!.icon} title={getFlowDef("score")!.name} subtitle={getFlowDef("score")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "score" && ["score_similarity", "score_ai_analysis", "score"].includes(s.id)).map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
                {(data?.byStage.score ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[6]} items={data?.byStage.score ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── 8. PROMOTE ── */}
            <SectionHeader icon={getFlowDef("promote")!.icon} title={getFlowDef("promote")!.name} subtitle={getFlowDef("promote")!.subtitle} />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-1 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "promote").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={articlesForSection(sub.parentStage).filter(sub.filterFn)} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                ))}
              </div>
            </div>

            {/* ── REVIEW + FAILED ── */}
            <SectionHeader icon={AlertTriangle} title="Needs Attention" subtitle="Review and failed articles" />
            <div className="px-6 max-lg:px-4 pb-8">
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                <StageColumn stage={STAGE_DEFS[7]} items={data?.byStage.review ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
                <StageColumn stage={STAGE_DEFS[8]} items={data?.byStage.failed ?? []} onRefresh={fetchPipeline} channelId={channelId} pp={pp} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
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
  sub, articles, onRefresh, channelId, pp,
}: {
  sub: SubStep; articles: ApiArticle[]; onRefresh: () => void; channelId: string | undefined; pp: (path: string) => string;
}) {
  const Icon = sub.icon;
  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: "400px" }}>
      <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${sub.color}`} />
          <span className="text-[12px] font-semibold">{sub.label}</span>
          <span className="text-[11px] text-dim font-mono">({articles.length})</span>
        </div>
        {sub.subtitle && (
          <div className="text-[10px] text-dim font-mono leading-tight pl-5.5">{sub.subtitle}</div>
        )}
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
  const translateContentLog = log.find(e => e.step === "translate_content");
  const detectLog = log.find(e => e.step === "detect_language");
  const researchLog = log.find(e => e.step === "research");
  const classifyLog = log.find(e => e.step === "classify");
  const scoreLog = log.find(e => e.step === "score");
  const promoteLog = log.find(e => e.step === "promote");

  return (
    <Link to={pp(`/article/${article.id}`)} className="block px-3 py-2.5 border-t border-border hover:bg-card/50 transition-colors group no-underline cursor-pointer">
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

      {subStep.id === "research" && researchLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={researchLog.status === "ok" ? "text-success" : "text-dim"}>{researchLog.status === "ok" ? "Done" : researchLog.status === "partial" ? "Partial" : researchLog.status}</span>
          {researchLog.narrativeStrength != null && <span className="text-success font-semibold">Narrative {researchLog.narrativeStrength}/10</span>}
        </div>
      )}

      {subStep.id === "lang_detect" && detectLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className={`px-1.5 py-0.5 rounded font-bold ${
            detectLog.detected === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
          }`}>
            {(detectLog.detected || "?").toUpperCase()}
          </span>
          {translateContentLog?.status === "skipped" && (
            <span className="text-dim">Already Arabic</span>
          )}
        </div>
      )}

      {subStep.id === "translate_content" && translateContentLog && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-dim">
          {translateContentLog.status === "skipped" ? (
            <span className="text-success">Native Arabic</span>
          ) : (
            <>
              <span>{translateContentLog.inputChars?.toLocaleString()} → {translateContentLog.outputChars?.toLocaleString()} chars</span>
              {translateContentLog.model && <span className="text-blue">{translateContentLog.model}</span>}
            </>
          )}
        </div>
      )}

      {subStep.id === "translate_analysis" && (() => {
        const logEntry = log.find(e => e.step === "translate_analysis");
        if (!logEntry) return null;
        return (
          <div className="text-[10px] font-mono text-dim">
            {logEntry.status === "skipped" ? <span className="text-success">Skipped</span> : (logEntry as any).fieldsTranslated != null && <span>{(logEntry as any).fieldsTranslated} fields</span>}
          </div>
        );
      })()}

      {subStep.id === "translate_research" && (() => {
        const logEntry = log.find(e => e.step === "translate_research");
        if (!logEntry) return null;
        return (
          <div className="text-[10px] font-mono text-dim">
            {logEntry.status === "skipped" ? <span className="text-success">Skipped</span> : logEntry.status === "ok" && logEntry.inputChars != null && logEntry.outputChars != null && (
              <span>{logEntry.inputChars.toLocaleString()} → {logEntry.outputChars.toLocaleString()} chars</span>
            )}
          </div>
        );
      })()}

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

      {subStep.id === "score_similarity" && (() => {
        const simLog = log.find(e => e.step === "score_similarity" && e.status === "ok");
        if (!simLog) return null;
        const matchCount = (simLog as any).matchCount ?? 0;
        const top = (simLog as any).topMatch;
        return (
          <div className="space-y-1 text-[10px] font-mono text-dim">
            <span>{matchCount} similar videos</span>
            {top?.title && <div className="truncate" title={top.title}>{top.title}</div>}
            {top?.similarity != null && <span className="text-purple">{(top.similarity as number).toFixed(2)}</span>}
          </div>
        );
      })()}

      {subStep.id === "score_ai_analysis" && (() => {
        const aiLog = log.find(e => e.step === "score_ai_analysis" && e.status === "ok");
        if (!aiLog) return null;
        return (
          <div className="space-y-1 text-[10px] font-mono">
            <span className="text-dim">Sentiment: <span className="text-foreground">{(aiLog as any).sentiment ?? "—"}</span></span>
            <div className="flex gap-2">
              <ScoreBar label="Rel" value={(aiLog as any).relevance} />
              <ScoreBar label="Viral" value={(aiLog as any).viralPotential} />
            </div>
          </div>
        );
      })()}

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
            Final: <span className="text-success">{scoreLog.finalScore}</span>
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
          {article.finalScore != null && (
            <span className="text-dim ml-auto">Score: {article.finalScore.toFixed(2)}</span>
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
  stage, items, onRefresh, channelId, pp,
}: {
  stage: { id: string; number: number; label: string; subtitle?: string; color: string };
  items: ApiArticle[];
  onRefresh: () => void;
  channelId: string | undefined;
  pp: (path: string) => string;
}) {
  const isFailed = stage.id === "failed";
  const isReview = stage.id === "review";
  const isProcessingStage = !isFailed && !isReview;
  const [retryingAll, setRetryingAll] = useState(false);

  const handleRetryAll = () => {
    if (!channelId) return;
    setRetryingAll(true);
    fetch("/api/article-pipeline/retry-all-failed", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Retrying"); onRefresh(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setRetryingAll(false));
  };

  const handleRestartStage = () => {
    if (!channelId) return;
    setRetryingAll(true);
    fetch("/api/article-pipeline/restart-stage", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, stage: stage.id }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { restarted: number }) => { toast.success(`Restarted ${d.restarted} articles`); onRefresh(); })
      .catch(() => toast.error("Failed"))
      .finally(() => setRetryingAll(false));
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ maxHeight: "400px" }}>
      <div className="px-3 py-2.5 bg-background shrink-0 border-b border-border space-y-1">
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
          {isProcessingStage && items.length > 0 && (
            <button onClick={handleRestartStage} disabled={retryingAll}
              title={`Restart all ${items.length} articles in ${stage.label}`}
              className="text-dim hover:text-sensor disabled:opacity-50 transition-colors">
              <RotateCw className={`w-3.5 h-3.5 ${retryingAll ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
        {stage.subtitle && (
          <div className="text-[10px] text-dim font-mono leading-tight pl-7">{stage.subtitle}</div>
        )}
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
    <div className="px-3 py-2.5 border-t border-border hover:bg-card/50 transition-colors group">
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
              entry.status === "ok" || entry.status === "created" || entry.status === "linked" ? "bg-success/10 text-success" :
              entry.status === "skipped" || entry.status === "failed" || entry.status === "parse_error" ? "bg-destructive/10 text-destructive" :
              entry.status === "review" || entry.status === "partial" ? "bg-orange/10 text-orange" :
              "bg-dim/10 text-dim"
            }`}>
              {LOG_STEP_LABELS[entry.step] ?? entry.step.replace(/_/g, " ")}
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
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold text-foreground ${
              article.language === "ar" ? "bg-success/15" : "bg-blue/15"
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
