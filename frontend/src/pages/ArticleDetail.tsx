import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import {
  ArrowLeft, ExternalLink, FileText, Globe, Languages, Brain,
  Sparkles, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Copy, Check, Search, Target, Server, Cpu,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─── */

interface QualityEval {
  score: number;
  issues?: string[] | null;
  filled?: number;
  total?: number;
  ratio?: number;
  arabicRatio?: number;
  chars?: number;
  citationCount?: number;
  narrativeStrength?: number | null;
}

interface LogEntry {
  step: string;
  status?: string;
  processor?: "ai" | "api" | "server";
  service?: string;
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
  snippets?: string[];
  citations?: number;
  briefKeys?: string[];
  narrativeStrength?: number;
  hasBrief?: boolean;
  query?: string;
  matchCount?: number;
  topMatch?: string | null;
  embeddingInputChars?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  promptSent?: string;
  rawResponse?: string;
  contentPreview?: string;
  quality?: QualityEval;
  fieldsTranslated?: number;
  summary?: string;
  uniqueAngle?: string;
  isBreaking?: boolean;
}

interface Analysis {
  topic?: string;
  topicAr?: string;
  tags?: string[];
  tagsAr?: string[];
  sentiment?: string;
  contentType?: string;
  region?: string;
  regionAr?: string;
  viralPotential?: number;
  relevance?: number;
  summary?: string;
  summaryAr?: string;
  isBreaking?: boolean;
  uniqueAngle?: string;
  uniqueAngleAr?: string;
  parseError?: boolean;
  raw?: string;
  research?: {
    relatedArticles?: { title?: string; url?: string; snippet?: string }[];
    backgroundContext?: string;
    citations?: string[];
    similarVideos?: { title?: string; views?: number; channel?: string; similarity?: number; type?: string }[];
    brief?: {
      whatHappened?: string;
      howItHappened?: string;
      whatWasTheResult?: string;
      keyFacts?: string[];
      timeline?: { date?: string; event?: string }[];
      mainCharacters?: { name?: string; role?: string }[];
      sources?: { title?: string; url?: string }[];
      competitionInsight?: string;
      suggestedHook?: string;
      narrativeStrength?: number;
    };
    researchedAt?: string;
  };
}

interface ArticleDetail {
  id: string;
  projectId: string;
  url: string;
  title: string | null;
  description: string | null;
  content: string | null;
  contentClean: string | null;
  contentAr: string | null;
  contentRawLength: number;
  contentCleanLength: number;
  contentArLength: number;
  publishedAt: string | null;
  language: string | null;
  stage: string;
  status: string;
  retries: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  processingLog: LogEntry[] | null;
  analysis: Analysis | null;
  relevanceScore: number | null;
  finalScore: number | null;
  rankReason: string | null;
  storyId: string | null;
  source: { id: string; label: string; type: string; language: string } | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Timeline stage definitions ─── */

interface TimelineStage {
  id: string;
  label: string;
  icon: typeof FileText;
  color: string;
  bgColor: string;
}

const TIMELINE_STAGES: TimelineStage[] = [
  { id: "imported", label: "Imported", icon: FileText, color: "text-orange", bgColor: "bg-orange" },
  { id: "content", label: "Content Extraction", icon: Globe, color: "text-blue", bgColor: "bg-blue" },
  { id: "classify", label: "Classification (Original Language)", icon: Brain, color: "text-success", bgColor: "bg-success" },
  { id: "research", label: "Research (Original Language)", icon: Search, color: "text-purple", bgColor: "bg-purple" },
  { id: "translated", label: "Translation to Arabic", icon: Languages, color: "text-blue", bgColor: "bg-blue" },
  { id: "scoring", label: "Scoring (Arabic AI Analysis)", icon: Sparkles, color: "text-orange", bgColor: "bg-orange" },
  { id: "promote", label: "Story Promotion", icon: CheckCircle2, color: "text-success", bgColor: "bg-success" },
];

const STAGE_ORDER = ["imported", "content", "classify", "research", "translated", "score", "done"];

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

/* ─── Helpers ─── */

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtElapsed(from: string | null, to?: string | null): string {
  if (!from) return "";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - start;
  if (ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/* ─── Main Component ─── */

export default function ArticleDetailPage() {
  const { projectId, id } = useParams();
  const pp = useProjectPath();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/article-pipeline/${id}/detail`, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then((d) => setArticle(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-[13px] text-dim">{error || "Article not found"}</p>
        <Link to={pp("/article-pipeline")} className="text-[12px] text-blue hover:underline">
          Back to Pipeline
        </Link>
      </div>
    );
  }

  const log: LogEntry[] = Array.isArray(article.processingLog) ? article.processingLog : [];
  const currentStageIdx = stageIndex(article.stage);
  const isDone = article.stage === "done";
  const isFailed = article.stage === "failed";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center gap-3 px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <Link to={pp("/article-pipeline")} className="text-dim hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[13px] font-medium text-foreground truncate">Article Inspector</h1>
        <span className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
          isDone ? "bg-success/15 text-success" :
          isFailed ? "bg-destructive/15 text-destructive" :
          article.status === "review" ? "bg-orange/15 text-orange" :
          "bg-blue/15 text-blue"
        }`}>
          {isDone ? "Completed" : isFailed ? "Failed" : article.status === "review" ? "Review" : article.stage}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 max-lg:px-4">

          {/* Article header card */}
          <div className="rounded-xl border border-border bg-background p-5 mb-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-[16px] font-semibold text-foreground leading-snug" dir="auto">
                {article.title || "Untitled"}
              </h2>
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                className="shrink-0 p-1.5 rounded-md border border-border hover:bg-surface transition-colors">
                <ExternalLink className="w-3.5 h-3.5 text-dim" />
              </a>
            </div>
            {article.description && (
              <p className="text-[12px] text-dim leading-relaxed mb-3 line-clamp-2" dir="auto">
                {article.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-dim">
              <span>{extractDomain(article.url)}</span>
              {article.source && <span className="px-1.5 py-0.5 rounded bg-surface text-foreground/70">{article.source.label}</span>}
              {article.language && (
                <span className={`px-1.5 py-0.5 rounded font-bold ${
                  article.language === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
                }`}>{article.language.toUpperCase()}</span>
              )}
              {article.publishedAt && <span>Published: {fmtDate(article.publishedAt)}</span>}
              <span>Created: {fmtDate(article.createdAt)}</span>
              {article.startedAt && <span>Started: {fmtDate(article.startedAt)}</span>}
              {article.finishedAt && (
                <span>Finished: {fmtDate(article.finishedAt)} ({fmtElapsed(article.startedAt, article.finishedAt)})</span>
              )}
              {article.retries > 0 && <span className="text-orange">{article.retries} retries</span>}
            </div>
            {article.error && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-[11px] font-mono">
                {article.error}
              </div>
            )}
            {article.finalScore != null && (
              <div className="mt-3 flex items-center gap-4 text-[11px] font-mono">
                <span className="text-foreground font-semibold">Score: {article.finalScore.toFixed(2)}</span>
                {article.relevanceScore != null && <span className="text-dim">Relevance: {article.relevanceScore.toFixed(2)}</span>}
                {article.rankReason && <span className="text-dim">{article.rankReason}</span>}
              </div>
            )}
            {article.storyId && (
              <div className="mt-3">
                <Link to={pp(`/story/${article.storyId}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success text-[11px] font-semibold hover:bg-success/20 transition-colors">
                  <CheckCircle2 className="w-3 h-3" /> View Story
                </Link>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="relative">
            {TIMELINE_STAGES.map((stage, i) => {
              const mappedStage =
                stage.id === "scoring" || stage.id === "promote" ? "score" : stage.id;
              const reached = isDone || currentStageIdx >= stageIndex(mappedStage);
              const isActive = !isDone && !isFailed && article.stage === mappedStage;

              return (
                <TimelineStep
                  key={stage.id}
                  stage={stage}
                  article={article}
                  log={log}
                  reached={reached}
                  isActive={isActive}
                  isLast={i === TIMELINE_STAGES.length - 1}
                  pp={pp}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Timeline Step ─── */

function TimelineStep({
  stage, article, log, reached, isActive, isLast, pp,
}: {
  stage: TimelineStage;
  article: ArticleDetail;
  log: LogEntry[];
  reached: boolean;
  isActive: boolean;
  isLast: boolean;
  pp: (p: string) => string;
}) {
  const [expanded, setExpanded] = useState(reached);
  const Icon = stage.icon;

  const stepLog = getStepLogs(stage.id, log);
  const timestamp = stepLog.length > 0 ? stepLog[0].at : null;

  return (
    <div className="relative flex gap-4">
      {/* Vertical line */}
      {!isLast && (
        <div className={`absolute left-[15px] top-[32px] bottom-0 w-[2px] ${
          reached ? stage.bgColor + "/30" : "bg-border"
        }`} />
      )}

      {/* Dot */}
      <div className={`relative z-10 mt-1 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 ${
        reached ? stage.bgColor + "/20" : "bg-surface"
      } border ${reached ? "border-" + stage.bgColor.replace("bg-", "") + "/40" : "border-border"}`}>
        <Icon className={`w-3.5 h-3.5 ${reached ? stage.color : "text-dim/40"}`} />
      </div>

      {/* Content */}
      <div className={`flex-1 pb-6 ${!reached ? "opacity-40" : ""}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left group"
        >
          <span className="text-[13px] font-semibold text-foreground">{stage.label}</span>
          {timestamp && <span className="text-[10px] text-dim font-mono">{fmtDate(timestamp)}</span>}
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
          {!reached && <span className="text-[10px] text-dim font-mono italic">pending</span>}
          {reached && (
            expanded
              ? <ChevronDown className="w-3 h-3 text-dim ml-auto" />
              : <ChevronRight className="w-3 h-3 text-dim ml-auto" />
          )}
        </button>

        {expanded && reached && (
          <div className="mt-3 rounded-xl border border-border bg-background overflow-hidden">
            {stage.id === "imported" && <ImportedDetail article={article} log={log} />}
            {stage.id === "content" && <ContentDetail article={article} log={log} />}
            {stage.id === "classify" && <AiAnalysisDetail article={article} log={log} />}
            {stage.id === "research" && <ResearchDetail article={article} log={log} pp={pp} />}
            {stage.id === "translated" && <TranslatedDetail article={article} log={log} />}
            {stage.id === "scoring" && <ScoringDetail article={article} log={log} />}
            {stage.id === "promote" && <PromoteDetail article={article} log={log} pp={pp} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Step log helpers ─── */

const STEP_MAP: Record<string, string[]> = {
  imported: ["imported"],
  content: ["apify_content", "firecrawl", "html_fetch", "content_source"],
  classify: ["classify"],
  research: ["research_decision", "firecrawl_search", "perplexity_context", "synthesis", "research"],
  translated: ["detect_language", "translate_content", "translate_analysis", "translate_research"],
  scoring: ["score_similarity", "score_ai_analysis", "score"],
  promote: ["promote"],
};

function getStepLogs(stageId: string, log: LogEntry[]): LogEntry[] {
  const steps = STEP_MAP[stageId] || [];
  return log.filter((e) => steps.includes(e.step));
}

/** Step id → label and icon for Kanban-style cards (same as pipeline columns). */
const STEP_DISPLAY: Record<string, { label: string; icon: typeof FileText }> = {
  imported: { label: "Imported", icon: FileText },
  apify_content: { label: "Check Apify Data", icon: FileText },
  firecrawl: { label: "Firecrawl Scrape", icon: Globe },
  html_fetch: { label: "HTML Fetch", icon: Globe },
  content_source: { label: "Content Source", icon: CheckCircle2 },
  classify: { label: "Classification", icon: Brain },
  research_decision: { label: "Research Decision", icon: Search },
  firecrawl_search: { label: "Web Search", icon: Search },
  perplexity_context: { label: "Background Context", icon: Brain },
  synthesis: { label: "AI Synthesis", icon: Sparkles },
  research: { label: "Research Complete", icon: Search },
  detect_language: { label: "Language Detection", icon: Languages },
  translate_content: { label: "Translate Article Content", icon: Languages },
  translate_analysis: { label: "Translate Classification Fields", icon: Brain },
  translate_research: { label: "Translate Research Brief", icon: Search },
  score_similarity: { label: "Competition Match", icon: Target },
  score_ai_analysis: { label: "AI Scoring", icon: Brain },
  score: { label: "Final Score", icon: Sparkles },
  promote: { label: "Story Promotion", icon: CheckCircle2 },
};

/** Single card for one pipeline step — identical style to Kanban view. */
function LogStepCard({
  entry,
  stepId,
  label,
  icon: Icon,
  children,
  skippedReason,
}: {
  entry: LogEntry | null;
  stepId: string;
  label: string;
  icon: typeof FileText;
  children: React.ReactNode;
  skippedReason?: string;
}) {
  const skipped = !entry && skippedReason;
  return (
    <div className={`px-3 py-2.5 rounded-lg border space-y-2 ${skipped ? "bg-surface/20 border-border/50 opacity-60" : "bg-surface/50 border-border"}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-dim" />}
          <span className="text-[11px] font-semibold">{label}</span>
          {entry?.processor && <ProcessorBadge type={entry.processor} />}
          {entry?.service && <span className="text-[9px] font-mono text-dim">{entry.service}</span>}
          {entry?.status && <StatusBadge status={entry.status} />}
          {skipped && <span className="text-[9px] font-mono text-dim px-1.5 py-0.5 rounded bg-muted">skipped</span>}
        </div>
        {entry && (entry.inputTokens != null || entry.outputTokens != null) && (
          <TokensBadge entry={entry} />
        )}
      </div>
      {skipped && <div className="text-[11px] text-dim">{skippedReason}</div>}
      {!skipped && children && <div className="text-[12px] text-dim leading-relaxed">{children}</div>}
    </div>
  );
}

/* ─── Collapsible content block ─── */

function ContentBlock({ label, content, dir, maxHeight = 200 }: {
  label: string; content: string | null; dir?: string; maxHeight?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!content) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-surface/50 border-b border-border">
        <span className="text-[10px] font-mono text-dim uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-dim">{content.length.toLocaleString()} chars</span>
          <button onClick={handleCopy} className="text-dim hover:text-foreground transition-colors">
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
      <div
        className="px-3 py-2.5 text-[12px] text-foreground/80 leading-[1.9] overflow-hidden transition-all"
        style={{ maxHeight: expanded ? "none" : maxHeight }}
        dir={dir || "auto"}
      >
        {content.split(/\n\n+/).map((para, i) => (
          <p key={i} className="mb-3 last:mb-0 whitespace-pre-wrap">
            {para}
          </p>
        ))}
      </div>
      {content.length > 300 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-1.5 text-[10px] font-mono text-blue hover:text-foreground bg-surface/30 border-t border-border transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/* ─── Side by side content comparison ─── */

function ContentComparison({ left, right, leftLabel, rightLabel, leftDir, rightDir }: {
  left: string | null; right: string | null;
  leftLabel: string; rightLabel: string;
  leftDir?: string; rightDir?: string;
}) {
  if (!left && !right) return null;

  return (
    <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
      <ContentBlock label={leftLabel} content={left} dir={leftDir} />
      <ContentBlock label={rightLabel} content={right} dir={rightDir} />
    </div>
  );
}

/* ─── Status badge ─── */

function StatusBadge({ status, label }: { status?: string; label?: string }) {
  const text = label || status || "unknown";
  const color =
    status === "ok" || status === "skipped" ? "bg-success/10 text-success" :
    status === "failed" || status === "parse_error" ? "bg-destructive/10 text-destructive" :
    status === "review" ? "bg-orange/10 text-orange" :
    "bg-dim/10 text-dim";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${color}`}>
      {text}
    </span>
  );
}

function ProcessorBadge({ type }: { type: "ai" | "server" | "api" }) {
  if (type === "ai") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple/10 text-purple text-[9px] font-mono font-bold uppercase">
      <Cpu className="w-2.5 h-2.5" />AI
    </span>
  );
  if (type === "api") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue/10 text-blue text-[9px] font-mono font-bold uppercase">
      <Globe className="w-2.5 h-2.5" />API
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-dim/10 text-dim text-[9px] font-mono font-bold uppercase">
      <Server className="w-2.5 h-2.5" />Server
    </span>
  );
}

function TokensBadge({ entry }: { entry?: LogEntry | null }) {
  if (!entry?.totalTokens) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-dim">
      <span>↑{entry.inputTokens?.toLocaleString()}</span>
      <span>↓{entry.outputTokens?.toLocaleString()}</span>
      <span className="text-foreground font-semibold">Σ{entry.totalTokens.toLocaleString()}</span>
    </span>
  );
}

function ExpandableText({ label, text, maxLen }: { label: string; text: string; maxLen?: number }) {
  const [open, setOpen] = useState(false);
  const isTruncated = maxLen && text.length >= maxLen - 2;
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="text-[10px] font-mono text-blue hover:text-blue/80 transition-colors flex items-center gap-1">
        {open ? "▾ Hide" : "▸ Show"} {label}
      </button>
      {open && (
        <div className="mt-1.5 px-3 py-2 rounded-lg bg-surface/50 border border-border text-[11px] font-mono text-dim whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto break-all">
          {text}
          {isTruncated && <span className="text-blue">…(truncated)</span>}
        </div>
      )}
    </div>
  );
}

function QualityBadge({ quality }: { quality?: QualityEval | null }) {
  if (!quality) return null;
  const s = quality.score;
  const color = s >= 8 ? "bg-success/10 text-success" : s >= 5 ? "bg-orange/10 text-orange" : "bg-destructive/10 text-destructive";
  const label = s >= 8 ? "Good" : s >= 5 ? "Fair" : "Poor";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold ${color}`}>
          Quality: {label} ({s}/10)
        </span>
        {quality.filled != null && quality.total != null && (
          <span className="text-[10px] font-mono text-dim">{quality.filled}/{quality.total} fields</span>
        )}
      </div>
      {quality.issues && quality.issues.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {quality.issues.map((issue, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-destructive/5 text-destructive text-[9px] font-mono">
              {issue}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StepHeader({ entry, label, icon: Icon }: { entry: LogEntry; label: string; icon?: typeof FileText }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-dim" />}
        <span className="text-[11px] font-semibold">{label}</span>
        {entry.processor && <ProcessorBadge type={entry.processor} />}
        {entry.service && <span className="text-[9px] font-mono text-dim">{entry.service}</span>}
        {entry.status && <StatusBadge status={entry.status} />}
      </div>
      <div className="flex items-center gap-2">
        <TokensBadge entry={entry} />
      </div>
    </div>
  );
}

/* ─── Stage detail components ─── */

function ImportedDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const stepId = "imported";
  const entry = log.find((e) => e.step === stepId);
  const { label, icon } = STEP_DISPLAY[stepId] || { label: stepId, icon: FileText };

  return (
    <div className="p-4 space-y-4">
      <LogStepCard entry={entry ?? null} stepId={stepId} label={label} icon={icon}>
        {article.source && (
          <span>Source: <span className="text-foreground">{article.source.label}</span> ({article.source.type})</span>
        )}
        {article.source?.language && (
          <span className="ml-2">Language: <span className="text-foreground">{article.source.language.toUpperCase()}</span></span>
        )}
        {entry?.rawChars != null && <span className="block mt-1">{entry.rawChars.toLocaleString()} chars · {entry.titlePreview ? "title present" : ""}</span>}
      </LogStepCard>
      {article.title && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Title</div>
          <div className="text-[13px] text-foreground font-medium" dir="auto">{article.title}</div>
        </div>
      )}
      {article.description && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Description</div>
          <div className="text-[12px] text-foreground/80" dir="auto">{article.description}</div>
        </div>
      )}
      <ContentBlock label={`Raw Content (${article.contentRawLength.toLocaleString()} chars)`} content={article.content} />
    </div>
  );
}

function ContentDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const steps = STEP_MAP.content;
  const apifyLog = log.find((e) => e.step === "apify_content");
  const apifySufficient = apifyLog && apifyLog.chars != null && apifyLog.threshold != null && apifyLog.chars >= apifyLog.threshold;

  return (
    <div className="p-4 space-y-3">
      {steps.map((stepId) => {
        const entry = log.find((e) => e.step === stepId);
        const { label, icon } = STEP_DISPLAY[stepId] || { label: stepId, icon: FileText };
        let body: React.ReactNode = null;
        if (stepId === "apify_content" && entry) {
          body = <>{entry.chars?.toLocaleString()} chars / {entry.threshold?.toLocaleString()} needed · {apifySufficient ? "Sufficient" : "Too short"}</>;
        } else if (stepId === "firecrawl" && entry) {
          body = <>{entry.chars != null && <span>{entry.chars.toLocaleString()} chars</span>}{entry.error && <span className="text-destructive"> · {entry.error}</span>}{entry.reason && <span> · {entry.reason}</span>}</>;
        } else if (stepId === "html_fetch" && entry) {
          body = <>{entry.chars != null && <span>{entry.chars.toLocaleString()} chars</span>}{entry.error && <span className="text-destructive"> · {entry.error}</span>}</>;
        } else if (stepId === "content_source" && entry) {
          body = (
            <>
              {entry.source === "apify" ? "Apify (original)" : entry.source === "firecrawl_or_html" ? "Firecrawl / HTML Fetch" : entry.source === "title_desc_fallback" ? "Title + Description (fallback)" : entry.source || "—"}
              {entry.chars != null && ` · ${entry.chars.toLocaleString()} chars extracted`}
            </>
          );
        }
        let skippedReason: string | undefined;
        if (!entry) {
          if ((stepId === "firecrawl" || stepId === "html_fetch") && apifySufficient) {
            skippedReason = "Apify content was sufficient";
          } else if (stepId === "html_fetch" && log.find((e) => e.step === "firecrawl")?.status === "ok") {
            skippedReason = "Firecrawl content was sufficient";
          }
        }
        return <LogStepCard key={stepId} entry={entry ?? null} stepId={stepId} label={label} icon={icon} skippedReason={skippedReason}>{body}</LogStepCard>;
      })}
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider pt-2">Content Comparison</div>
      <ContentComparison
        left={article.content}
        right={article.contentClean}
        leftLabel={`Raw (${article.contentRawLength.toLocaleString()} chars)`}
        rightLabel={`Cleaned (${article.contentCleanLength.toLocaleString()} chars)`}
      />
    </div>
  );
}

function TranslatedDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const contentLog = log.find((e) => e.step === "translate_content");
  const steps = STEP_MAP.translated;

  return (
    <div className="p-4 space-y-4">
      {steps.map((stepId) => {
        const entry = log.find((e) => e.step === stepId);
        const { label, icon } = STEP_DISPLAY[stepId] || { label: stepId, icon: Languages };
        let body: React.ReactNode = null;
        if (stepId === "detect_language" && entry) {
          body = <span className={entry.detected === "ar" ? "text-success font-semibold" : "text-blue"}>{(entry.detected || "unknown").toUpperCase()}</span>;
        } else if (stepId === "translate_content" && entry) {
          body = (
            <>
              {entry.status === "ok" && entry.inputChars != null && entry.outputChars != null && (
                <span>{entry.inputChars.toLocaleString()} → {entry.outputChars.toLocaleString()} chars</span>
              )}
              {entry.status === "skipped" && <span>{entry.reason ?? "Skipped"}</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={500} /></div>}
              {entry.rawResponse && <div className="mt-1"><ExpandableText label="response" text={entry.rawResponse} maxLen={500} /></div>}
            </>
          );
        } else if (stepId === "translate_analysis" && entry) {
          body = (
            <>
              {entry.status === "ok" && (entry as any).fieldsTranslated != null && <span>{(entry as any).fieldsTranslated} fields</span>}
              {entry.status === "skipped" && <span>{entry.reason ?? "Skipped"}</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={400} /></div>}
              {entry.rawResponse && <div className="mt-1"><ExpandableText label="response" text={entry.rawResponse} maxLen={400} /></div>}
            </>
          );
        } else if (stepId === "translate_research" && entry) {
          body = (
            <>
              {entry.status === "ok" && entry.inputChars != null && entry.outputChars != null && (
                <span>{entry.inputChars.toLocaleString()} → {entry.outputChars.toLocaleString()} chars</span>
              )}
              {(entry.status === "skipped" || entry.status === "failed") && <span>{entry.reason ?? (entry as any).error ?? entry.status}</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={400} /></div>}
            </>
          );
        }
        return <LogStepCard key={stepId} entry={entry ?? null} stepId={stepId} label={label} icon={icon}>{body}</LogStepCard>;
      })}

      {article.analysis && (article.analysis.topicAr || article.analysis.summaryAr) && (
        <div className="rounded-lg border border-purple/20 bg-purple/5 p-3 space-y-1.5">
          <div className="text-[10px] font-mono text-purple uppercase tracking-wider">Arabic fields</div>
          {article.analysis.topicAr && <div className="text-[11px]" dir="rtl">{article.analysis.topicAr}</div>}
          {article.analysis.summaryAr && <div className="text-[11px]" dir="rtl">{article.analysis.summaryAr}</div>}
        </div>
      )}

      {/* Content comparison */}
      {contentLog?.status === "ok" && (
        <>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Translation Comparison</div>
          <ContentComparison
            left={article.contentClean}
            right={article.contentAr}
            leftLabel={`Original (${article.contentCleanLength.toLocaleString()} chars)`}
            rightLabel={`Arabic Translation (${article.contentArLength.toLocaleString()} chars)`}
            rightDir="rtl"
          />
        </>
      )}

      {contentLog?.status === "skipped" && article.contentAr && (
        <ContentBlock
          label={`Arabic Content (${article.contentArLength.toLocaleString()} chars)`}
          content={article.contentAr}
          dir="rtl"
        />
      )}
    </div>
  );
}

function AiAnalysisDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const classifyLog = log.find((e) => e.step === "classify");
  const analysis = article.analysis;

  if (!analysis) {
    return <div className="p-4 text-[12px] text-dim font-mono">No classification data yet.</div>;
  }

  if (analysis.parseError) {
    return (
      <div className="p-4 space-y-3">
        <StatusBadge status="failed" label="Parse Error" />
        {analysis.raw && <ContentBlock label="Raw AI Response (failed to parse)" content={analysis.raw} />}
      </div>
    );
  }

  const stepId = "classify";
  const { label, icon } = STEP_DISPLAY[stepId] || { label: "Classification", icon: Brain };

  return (
    <div className="p-4 space-y-4">
      <LogStepCard entry={classifyLog ?? null} stepId={stepId} label={label} icon={icon}>
        {classifyLog?.quality && <QualityBadge quality={classifyLog.quality} />}
        {classifyLog?.inputChars != null && <span>{classifyLog.inputChars.toLocaleString()} chars → {classifyLog.service ?? "Claude Haiku"}</span>}
        {classifyLog?.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={classifyLog.promptSent} maxLen={800} /></div>}
        {classifyLog?.rawResponse && <div className="mt-1"><ExpandableText label="response" text={classifyLog.rawResponse} maxLen={800} /></div>}
      </LogStepCard>

      {/* Topic (original language) */}
      {analysis.topic && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Topic (original language)</div>
          <div className="text-[13px] text-foreground font-medium leading-relaxed" dir="auto">{analysis.topic}</div>
        </div>
      )}

      {/* Summary (original language) */}
      {analysis.summary && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Summary (original language)</div>
          <div className="text-[12px] text-foreground/80 leading-relaxed" dir="auto">{analysis.summary}</div>
        </div>
      )}

      {/* Tags (original language) */}
      {analysis.tags && analysis.tags.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Tags (original language)</div>
          <div className="flex flex-wrap gap-1.5" dir="auto">
            {analysis.tags.map((tag, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-mono">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Region (original language) */}
      {analysis.region && (
        <InfoCard label="Region (original language)" value={analysis.region} />
      )}

      {/* Classification grid — no sentiment/viral/relevance/breaking (those are in Scoring stage) */}
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <InfoCard label="Content Type" value={analysis.contentType || "—"} />
      </div>

      {/* Unique angle */}
      {analysis.uniqueAngle && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Unique Angle (original language)</div>
          <div className="text-[12px] text-foreground/80 italic" dir="auto">{analysis.uniqueAngle}</div>
        </div>
      )}
    </div>
  );
}

function ScoringDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const similarityLog = log.find((e) => e.step === "score_similarity");
  const aiLog = log.find((e) => e.step === "score_ai_analysis");
  const scoreLog = log.find((e) => e.step === "score");

  const hasAny = similarityLog || aiLog || scoreLog;
  if (!hasAny) {
    return <div className="p-4 text-[12px] text-dim font-mono">No scoring data yet.</div>;
  }

  const relevance = (aiLog?.relevance ?? scoreLog?.relevance) ?? 0;
  const viral = (aiLog?.viralPotential ?? scoreLog?.viralPotential) ?? 0;
  const freshness = scoreLog?.freshness ?? 0;
  const prefBias = scoreLog?.preferenceBias ?? 0;
  const competitionPenalty = scoreLog?.competitionPenalty ?? 0;
  const finalScore = scoreLog?.finalScore ?? 0;

  const steps = STEP_MAP.scoring;

  return (
    <div className="p-4 space-y-4">
      {steps.map((stepId) => {
        const entry = log.find((e) => e.step === stepId);
        const { label, icon } = STEP_DISPLAY[stepId] || { label: stepId, icon: Sparkles };
        let body: React.ReactNode = null;
        if (stepId === "score_similarity" && entry) {
          body = (
            <>
              {entry.status === "ok" && (
                <>
                  <span>{(entry as any).embeddingInputChars?.toLocaleString()} chars → {(entry as any).matchCount ?? 0} matches</span>
                  {(entry as any).similarVideos?.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5">
                      {((entry as any).similarVideos as { title?: string; similarity?: number }[]).slice(0, 5).map((v, i) => (
                        <li key={i}>{v.title || "—"} ({(v.similarity ?? 0).toFixed(2)})</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {entry.status !== "ok" && <span>{(entry as any).reason || (entry as any).error || "Skipped"}</span>}
            </>
          );
        } else if (stepId === "score_ai_analysis" && entry) {
          body = (
            <>
              {((entry as any).inputTokens != null || (entry as any).outputTokens != null) && (
                <span>Tokens: {(entry as any).inputTokens ?? "—"} / {(entry as any).outputTokens ?? "—"} / {(entry as any).totalTokens ?? "—"}</span>
              )}
              {(entry as any).sentiment && <span className="ml-2">Sentiment: {(entry as any).sentiment}</span>}
              {(entry as any).viralPotential != null && <span className="ml-2">Viral: {(entry as any).viralPotential}</span>}
              {(entry as any).relevance != null && <span className="ml-2">Relevance: {(entry as any).relevance}</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={500} /></div>}
              {entry.rawResponse && <div className="mt-1"><ExpandableText label="response" text={entry.rawResponse} maxLen={500} /></div>}
            </>
          );
        } else if (stepId === "score" && entry) {
          body = (
            <>
              <div className="space-y-1">
                <ScoreRow label="Relevance" value={relevance} weight={0.35} result={relevance * 0.35} />
                <ScoreRow label="Viral" value={viral} weight={0.30} result={viral * 0.30} />
                <ScoreRow label="Freshness" value={freshness} weight={0.35} result={freshness * 0.35} />
              </div>
              <div className="text-[11px] font-mono mt-1">
                Raw {(relevance * 0.35 + viral * 0.30 + freshness * 0.35).toFixed(3)}
                {prefBias !== 0 && ` · Pref ${prefBias > 0 ? "+" : ""}${prefBias.toFixed(2)}`}
                {competitionPenalty > 0 && ` · Penalty -${competitionPenalty.toFixed(2)}`}
                {" → "}<span className="font-bold text-success">Final {finalScore.toFixed(2)}</span>
              </div>
            </>
          );
        }
        let skippedReason: string | undefined;
        if (!entry && stepId === "score_similarity") {
          skippedReason = similarityLog?.reason ?? "No embedding key";
        }
        return <LogStepCard key={stepId} entry={entry ?? null} stepId={stepId} label={label} icon={icon} skippedReason={skippedReason}>{body}</LogStepCard>;
      })}

      {article.rankReason && (
        <div className="flex flex-wrap gap-1.5">
          {article.rankReason.split(", ").map((reason, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono">
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PromoteDetail({ article, log, pp }: { article: ArticleDetail; log: LogEntry[]; pp: (p: string) => string }) {
  const stepId = "promote";
  const entry = log.find((e) => e.step === stepId);
  const { label, icon } = STEP_DISPLAY[stepId] || { label: "Story Promotion", icon: CheckCircle2 };

  return (
    <div className="p-4 space-y-3">
      <LogStepCard
        entry={entry ?? null}
        stepId={stepId}
        label={entry?.status === "created" ? "Story Created" : entry?.status === "linked" ? "Linked to Existing" : label}
        icon={icon}
      >
        {entry?.status === "created" && article.storyId && (
          <Link to={pp(`/story/${article.storyId}`)} className="text-success hover:underline font-medium">
            Story created — click to view
          </Link>
        )}
        {entry?.status === "linked" && <span>Article linked to existing story (same headline).</span>}
        {entry?.status === "skipped" && <span>{entry.reason ?? "Skipped"}</span>}
        {entry?.status === "failed" && <span className="text-destructive">{entry.error ?? "Failed"}</span>}
      </LogStepCard>
      {entry?.status === "created" && article.storyId && (
        <Link to={pp(`/story/${article.storyId}`)}
          className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/5 border border-success/20 hover:bg-success/10 transition-colors">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span className="text-[13px] font-semibold">View story</span>
          <ArrowLeft className="w-4 h-4 text-dim ml-auto rotate-180" />
        </Link>
      )}
    </div>
  );
}

/* ─── Research Detail ─── */

function ResearchDetail({ article, log, pp }: { article: ArticleDetail; log: LogEntry[]; pp: (p: string) => string }) {
  const research = (article.analysis as Analysis | null)?.research;
  const brief = research?.brief;
  const steps = STEP_MAP.research;

  return (
    <div className="p-4 space-y-4">
      {/* Stage-by-stage cards (same order as Kanban) */}
      {steps.map((stepId) => {
        const entry = log.find((e) => e.step === stepId);
        const { label, icon } = STEP_DISPLAY[stepId] || { label: stepId, icon: Search };
        let body: React.ReactNode = null;
        if (stepId === "research_decision" && entry) {
          body = <>{entry.reason ?? (entry.needed ? "Research needed" : "Skipped")}</>;
        } else if (stepId === "firecrawl_search" && entry) {
          body = (
            <>
              {entry.reason && <span>{entry.reason}</span>}
              {entry.query && <div className="mt-1 font-mono text-[11px]">Query: {entry.query}</div>}
              {entry.resultsCount != null && <div className="mt-1">{entry.resultsCount} results</div>}
              {entry.titles?.slice(0, 3).map((t: string, i: number) => <div key={i} className="text-[11px] truncate">· {t}</div>)}
            </>
          );
        } else if (stepId === "perplexity_context" && entry) {
          body = (
            <>
              {entry.chars != null && <span>{entry.chars.toLocaleString()} chars</span>}
              {entry.citations != null && <span> · {entry.citations} citations</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={500} /></div>}
              {entry.rawResponse && <div className="mt-1"><ExpandableText label="response" text={entry.rawResponse} maxLen={500} /></div>}
            </>
          );
        } else if (stepId === "synthesis" && entry) {
          body = (
            <>
              {(entry as any).briefKeys?.length > 0 && <span>{(entry as any).briefKeys.length} sections</span>}
              {entry.promptSent && <div className="mt-1"><ExpandableText label="prompt" text={entry.promptSent} maxLen={400} /></div>}
              {entry.rawResponse && <div className="mt-1"><ExpandableText label="response" text={entry.rawResponse} maxLen={400} /></div>}
            </>
          );
        } else if (stepId === "research" && entry) {
          body = (
            <>
              {entry.status && <span>{entry.status === "ok" ? "Research complete" : entry.status === "partial" ? "Partially researched" : entry.status}</span>}
              {(entry.narrativeStrength != null || brief?.narrativeStrength != null) && (
                <span className="ml-2 font-semibold text-success">Narrative: {(brief?.narrativeStrength ?? entry.narrativeStrength ?? 0)}/10</span>
              )}
            </>
          );
        }
        let skippedReason: string | undefined;
        if (!entry && stepId !== "research_decision" && stepId !== "research") {
          const decision = log.find((e) => e.step === "research_decision");
          if (decision && !decision.needed) skippedReason = "Research not needed";
        }
        return <LogStepCard key={stepId} entry={entry ?? null} stepId={stepId} label={label} icon={icon} skippedReason={skippedReason}>{body}</LogStepCard>;
      })}

      {/* ── Suggested Hook ── */}
      {brief?.suggestedHook && (
        <div className="px-4 py-3 rounded-lg bg-purple/5 border border-purple/20">
          <div className="text-[10px] font-mono text-purple uppercase tracking-wider mb-1.5">Suggested Video Hook</div>
          <div className="text-[14px] text-foreground font-medium leading-relaxed" dir="auto">
            "{brief.suggestedHook}"
          </div>
        </div>
      )}

      {/* ── Core Story: What / How / Result ── */}
      {(brief?.whatHappened || brief?.howItHappened || brief?.whatWasTheResult) && (
        <div className="space-y-3">
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Core Narrative</div>
          {brief?.whatHappened && (
            <div className="px-4 py-3 rounded-lg bg-surface/50 border border-border">
              <div className="text-[10px] font-mono text-blue uppercase tracking-wider mb-1.5">What happened?</div>
              <div className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.whatHappened}</div>
            </div>
          )}
          {brief?.howItHappened && (
            <div className="px-4 py-3 rounded-lg bg-surface/50 border border-border">
              <div className="text-[10px] font-mono text-orange uppercase tracking-wider mb-1.5">How did it happen?</div>
              <div className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.howItHappened}</div>
            </div>
          )}
          {brief?.whatWasTheResult && (
            <div className="px-4 py-3 rounded-lg bg-surface/50 border border-border">
              <div className="text-[10px] font-mono text-success uppercase tracking-wider mb-1.5">What was the result?</div>
              <div className="text-[13px] text-foreground/90 leading-[1.8]" dir="auto">{brief.whatWasTheResult}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Key Facts ── */}
      {brief?.keyFacts && brief.keyFacts.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Key Facts</div>
          <div className="space-y-1.5">
            {brief.keyFacts.map((fact, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface/50 border border-border">
                <span className="text-[10px] font-mono text-purple font-bold mt-0.5 shrink-0">{i + 1}</span>
                <span className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{fact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      {brief?.timeline && brief.timeline.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Timeline</div>
          <div className="space-y-1">
            {brief.timeline.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-surface/50 border border-border">
                <span className="text-[11px] font-mono text-blue shrink-0 w-24">{entry.date}</span>
                <span className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{entry.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Characters ── */}
      {brief?.mainCharacters && brief.mainCharacters.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Key People</div>
          <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            {brief.mainCharacters.map((person, i) => (
              <div key={i} className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="text-[12px] font-semibold text-foreground" dir="auto">{person.name}</div>
                <div className="text-[11px] text-dim mt-0.5" dir="auto">{person.role}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Competition Insight ── */}
      {brief?.competitionInsight && (
        <div className="px-4 py-3 rounded-lg bg-orange/5 border border-orange/20">
          <div className="text-[10px] font-mono text-orange uppercase tracking-wider mb-1.5">Competition Insight</div>
          <div className="text-[12px] text-foreground/85 leading-relaxed" dir="auto">{brief.competitionInsight}</div>
        </div>
      )}

      {/* ── Related Articles Found ── */}
      {research?.relatedArticles && research.relatedArticles.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">
            Related Articles Found ({research.relatedArticles.length})
          </div>
          <div className="space-y-1.5">
            {research.relatedArticles.map((ra, i) => (
              <div key={i} className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-blue shrink-0">{i + 1}.</span>
                  {ra.url ? (
                    <a href={ra.url} target="_blank" rel="noopener noreferrer"
                      className="text-[12px] font-medium text-foreground hover:text-blue transition-colors truncate">
                      {ra.title || ra.url}
                    </a>
                  ) : (
                    <span className="text-[12px] font-medium text-foreground truncate">{ra.title}</span>
                  )}
                </div>
                {ra.snippet && (
                  <div className="text-[11px] text-dim line-clamp-2 pl-5">{ra.snippet}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Background Context ── */}
      {research?.backgroundContext && (
        <ContentBlock
          label={`Background Context from Perplexity (${research.backgroundContext.length.toLocaleString()} chars)`}
          content={research.backgroundContext}
          dir="auto"
        />
      )}

      {/* ── Similar Competition Videos ── */}
      {research?.similarVideos && research.similarVideos.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">
            Similar Competition Videos ({research.similarVideos.length})
          </div>
          <div className="space-y-1.5">
            {research.similarVideos.map((v, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 border border-border">
                <span className="text-[10px] font-mono text-purple shrink-0">{i + 1}.</span>
                <span className="text-[12px] text-foreground truncate flex-1" dir="auto">{v.title}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono text-dim shrink-0">
                  {v.views != null && <span>{v.views.toLocaleString()} views</span>}
                  {v.channel && <span>{v.channel}</span>}
                  {v.similarity != null && (
                    <span className="text-purple">{Math.round(v.similarity * 100)}% match</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sources ── */}
      {brief?.sources && brief.sources.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Sources</div>
          <div className="flex flex-wrap gap-1.5">
            {brief.sources.map((s, i) => (
              s.url ? (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-1 rounded bg-blue/10 text-blue text-[10px] font-mono hover:bg-blue/20 transition-colors">
                  {s.title || s.url}
                </a>
              ) : (
                <span key={i} className="px-2 py-1 rounded bg-dim/10 text-dim text-[10px] font-mono">
                  {s.title}
                </span>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small helpers ─── */

function InfoCard({ label, value, color, dir }: { label: string; value: string; color?: string; dir?: string }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[13px] font-medium ${color || "text-foreground"}`} dir={dir}>{value}</div>
    </div>
  );
}

function ScoreGauge({ label, value }: { label: string; value?: number }) {
  const v = typeof value === "number" ? value : 0;
  const pct = Math.round(v * 100);
  const color = pct >= 70 ? "text-success" : pct >= 40 ? "text-orange" : "text-destructive";
  const bgColor = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-orange" : "bg-destructive";

  return (
    <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-dim uppercase tracking-wider">{label}</span>
        <span className={`text-[13px] font-mono font-bold ${color}`}>{v.toFixed(2)}</span>
      </div>
      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScoreRow({ label, value, weight, result }: { label: string; value: number; weight: number; result: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/50 border border-border">
      <span className="text-[12px] font-mono text-dim w-28">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-foreground w-10 text-right">{value.toFixed(2)}</span>
      <span className="text-[10px] font-mono text-dim">× {weight}</span>
      <span className="text-[11px] font-mono text-foreground w-12 text-right">= {result.toFixed(3)}</span>
    </div>
  );
}
