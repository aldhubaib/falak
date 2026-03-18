import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import {
  RotateCw, Pause, Play, Circle, AlertTriangle, ExternalLink,
  SkipForward, Trash2, ClipboardPaste, X, Loader2, CheckCircle2,
  ArrowRight, Globe, Languages, Brain, Sparkles, FileText, Download,
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
  // Translated sub-steps
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
  // AI Analysis sub-steps
  {
    id: "classify", label: "Classify", icon: Brain, color: "text-success",
    parentStage: "ai_analysis",
    filterFn: (a) => hasLogStep(a, "classify"),
  },
  {
    id: "score", label: "Score", icon: Sparkles, color: "text-orange",
    parentStage: "ai_analysis",
    filterFn: (a) => hasLogStep(a, "score"),
  },
  {
    id: "promote", label: "Story Created", icon: CheckCircle2, color: "text-success",
    parentStage: "done",
    filterFn: (a) => {
      const log = getLogStep(a, "promote");
      return log?.status === "created";
    },
  },
];

const STAGE_DEFS = [
  { id: "imported", label: "Imported", color: "text-orange", number: 1 },
  { id: "content", label: "Content", color: "text-blue", number: 2 },
  { id: "translated", label: "Translated", color: "text-purple", number: 3 },
  { id: "ai_analysis", label: "AI Analysis", color: "text-success", number: 4 },
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
  const [countdown, setCountdown] = useState(30);

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

            {/* ── CONTENT FLOW ── */}
            <SectionHeader icon={FileText} title="Content Flow" subtitle="How articles get their text" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-1 items-start">
                <StageColumn stage={STAGE_DEFS[0]} items={data?.byStage.imported ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                {SUB_STEPS.filter(s => s.parentStage === "content").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
              </div>
              {/* Active content items (currently being processed) */}
              {(data?.byStage.content ?? []).length > 0 && (
                <div className="mt-3">
                  <StageColumn stage={STAGE_DEFS[1]} items={data?.byStage.content ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                </div>
              )}
            </div>

            {/* ── TRANSLATION FLOW ── */}
            <SectionHeader icon={Languages} title="Translation Flow" subtitle="Language detection and Arabic translation" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "translated").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
                {(data?.byStage.translated ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[2]} items={data?.byStage.translated ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── AI ANALYSIS FLOW ── */}
            <SectionHeader icon={Brain} title="AI Analysis Flow" subtitle="Classification, scoring, and story promotion" />
            <div className="px-6 max-lg:px-4 mb-6">
              <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-1 items-start">
                {SUB_STEPS.filter(s => s.parentStage === "ai_analysis" || s.parentStage === "done").map((sub) => (
                  <SubStepColumn key={sub.id} sub={sub} articles={doneArticles.filter(sub.filterFn)} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                ))}
                {(data?.byStage.ai_analysis ?? []).length > 0 && (
                  <StageColumn stage={STAGE_DEFS[3]} items={data?.byStage.ai_analysis ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                )}
              </div>
            </div>

            {/* ── REVIEW + FAILED ── */}
            {((data?.byStage.review ?? []).length > 0 || (data?.byStage.failed ?? []).length > 0) && (
              <>
                <SectionHeader icon={AlertTriangle} title="Needs Attention" subtitle="Review and failed articles" />
                <div className="px-6 max-lg:px-4 pb-8">
                  <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1 items-start">
                    <StageColumn stage={STAGE_DEFS[4]} items={data?.byStage.review ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
                    <StageColumn stage={STAGE_DEFS[5]} items={data?.byStage.failed ?? []} onRefresh={fetchPipeline} projectId={projectId} pp={pp} />
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
    <div className="px-3 py-2.5 border-t border-border hover:bg-surface/50 transition-colors group">
      {/* Title row */}
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="text-[12px] text-foreground font-medium truncate flex-1" dir="auto">
          {article.title || domain || article.id.slice(0, 8)}
        </span>
        <a href={article.url} target="_blank" rel="noopener noreferrer"
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

      {subStep.id === "classify" && analysis && !analysis.parseError && (
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
    </div>
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
          <span className="text-[12px] text-foreground font-medium truncate" dir="auto">
            {article.title || domain || article.id.slice(0, 8)}
          </span>
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
          {article.retries > 0 && <span>⟳{article.retries}</span>}
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
