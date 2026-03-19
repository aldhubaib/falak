import { useState, useEffect } from "react";
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
  rankScore?: number;
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
  rankScore: number | null;
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
  { id: "scoring", label: "Scoring", icon: Sparkles, color: "text-orange", bgColor: "bg-orange" },
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
            {article.rankScore != null && (
              <div className="mt-3 flex items-center gap-4 text-[11px] font-mono">
                <span className="text-foreground font-semibold">Rank: {article.rankScore.toFixed(2)}</span>
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
  research: ["research_decision", "firecrawl_search", "perplexity_context", "db_similarity", "synthesis", "research"],
  translated: ["detect_language", "translate_content", "translate_analysis", "translate_research"],
  scoring: ["score"],
  promote: ["promote"],
};

function getStepLogs(stageId: string, log: LogEntry[]): LogEntry[] {
  const steps = STEP_MAP[stageId] || [];
  return log.filter((e) => steps.includes(e.step));
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
  const importedLog = log.find((e) => e.step === "imported");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ProcessorBadge type="api" />
        <span className="text-[9px] font-mono text-dim">Apify Scraper</span>
        {importedLog && <StatusBadge status={importedLog.status} label="Imported" />}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
        {article.source && (
          <span className="text-dim">
            Source: <span className="text-foreground">{article.source.label}</span> ({article.source.type})
          </span>
        )}
        {article.source?.language && (
          <span className="text-dim">Language: <span className="text-foreground">{article.source.language.toUpperCase()}</span></span>
        )}
      </div>

      <div className="space-y-3">
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
        <ContentBlock
          label={`Raw Content from Apify (${article.contentRawLength.toLocaleString()} chars total)`}
          content={article.content}
        />
      </div>
    </div>
  );
}

function ContentDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const apifyLog = log.find((e) => e.step === "apify_content");
  const firecrawlLog = log.find((e) => e.step === "firecrawl");
  const htmlLog = log.find((e) => e.step === "html_fetch");
  const sourceLog = log.find((e) => e.step === "content_source");

  const apifySufficient = apifyLog && apifyLog.chars != null && apifyLog.threshold != null
    && apifyLog.chars >= apifyLog.threshold;

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Service Attempts</div>
      <div className="space-y-2">
        {/* Apify check */}
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-orange" />
              <span className="text-[11px] font-semibold">Check Apify Data</span>
              <ProcessorBadge type="server" />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {apifyLog && (
                <>
                  <span className="text-dim">{apifyLog.chars?.toLocaleString()} chars / {apifyLog.threshold?.toLocaleString()} needed</span>
                  <StatusBadge status={apifySufficient ? "ok" : "failed"} label={apifySufficient ? "Sufficient" : "Too short"} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Firecrawl */}
        {firecrawlLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-blue" />
                <span className="text-[11px] font-semibold">Firecrawl Scrape</span>
                <ProcessorBadge type={firecrawlLog.processor || "api"} />
                <span className="text-[9px] font-mono text-dim">{firecrawlLog.service || "Firecrawl"}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                {firecrawlLog.chars != null && <span className="text-dim">{firecrawlLog.chars.toLocaleString()} chars</span>}
                <StatusBadge status={firecrawlLog.status} />
              </div>
            </div>
            {firecrawlLog.error && <div className="text-[10px] font-mono text-destructive/70">{firecrawlLog.error}</div>}
            {firecrawlLog.reason && <div className="text-[10px] font-mono text-dim">{firecrawlLog.reason}</div>}
          </div>
        )}

        {/* HTML Fetch */}
        {htmlLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-purple" />
                <span className="text-[11px] font-semibold">HTML Fetch</span>
                <ProcessorBadge type={htmlLog.processor || "server"} />
                <span className="text-[9px] font-mono text-dim">{htmlLog.service || "Direct HTTP"}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                {htmlLog.chars != null && <span className="text-dim">{htmlLog.chars.toLocaleString()} chars</span>}
                <StatusBadge status={htmlLog.status} />
              </div>
            </div>
            {htmlLog.error && <div className="text-[10px] font-mono text-destructive/70">{htmlLog.error}</div>}
          </div>
        )}
      </div>

      {/* Winner */}
      {sourceLog && (
        <div className="px-3 py-2.5 rounded-lg border-2 border-success/30 bg-success/5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Content Source: {sourceLog.source === "apify" ? "Apify (original)" :
              sourceLog.source === "firecrawl_or_html" ? "Firecrawl / HTML Fetch" :
              sourceLog.source === "title_desc_fallback" ? "Title + Description (fallback)" :
              sourceLog.source || "unknown"}
          </div>
          <div className="text-[11px] font-mono text-dim mt-1">
            {sourceLog.chars?.toLocaleString()} chars extracted
          </div>
        </div>
      )}

      {/* Content comparison */}
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Content Comparison</div>
      <ContentComparison
        left={article.content}
        right={article.contentClean}
        leftLabel={`Raw from Apify (${article.contentRawLength.toLocaleString()} chars)`}
        rightLabel={`Cleaned (${article.contentCleanLength.toLocaleString()} chars)`}
      />
    </div>
  );
}

function TranslatedDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const detectLog = log.find((e) => e.step === "detect_language");
  const contentLog = log.find((e) => e.step === "translate_content");
  const analysisLog = log.find((e) => e.step === "translate_analysis");
  const researchLog = log.find((e) => e.step === "translate_research");

  return (
    <div className="p-4 space-y-4">
      {/* Step 1: Language detection */}
      {detectLog && (
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-1">
          <StepHeader entry={detectLog} label="Language Detection" icon={Languages} />
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono">Result:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              detectLog.detected === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
            }`}>
              {(detectLog.detected || "unknown").toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Step 2: Translate article content */}
      {contentLog && (
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
          <StepHeader entry={contentLog} label="Translate Article Content" icon={Languages} />

          {contentLog.quality && <QualityBadge quality={contentLog.quality} />}

          {contentLog.status === "ok" && (
            <>
              <div className="flex items-center gap-4 text-[11px] font-mono text-dim">
                <span>Input: {contentLog.inputChars?.toLocaleString()} chars ({contentLog.inputLang?.toUpperCase()})</span>
                <span>→</span>
                <span>Output: {contentLog.outputChars?.toLocaleString()} chars (AR)</span>
              </div>

              {contentLog.promptSent && (
                <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Before — Sent to AI</div>
                  <ExpandableText label="full prompt" text={contentLog.promptSent} maxLen={1500} />
                </div>
              )}

              {contentLog.rawResponse && (
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">After — Arabic Content</div>
                  <ExpandableText label="translated text" text={contentLog.rawResponse} maxLen={1500} />
                </div>
              )}
            </>
          )}

          {contentLog.status === "skipped" && (
            <div className="text-[11px] text-dim font-mono">{contentLog.reason || "Skipped"}</div>
          )}
        </div>
      )}

      {/* Step 3: Translate classification fields */}
      {analysisLog && (
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
          <StepHeader entry={analysisLog} label="Translate Classification Fields" icon={Brain} />

          {analysisLog.status === "ok" && (
            <>
              <div className="text-[11px] font-mono text-dim">
                {analysisLog.fieldsTranslated} fields translated to Arabic
              </div>

              {analysisLog.promptSent && (
                <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Before — Fields sent to AI</div>
                  <ExpandableText label="full prompt" text={analysisLog.promptSent} maxLen={1500} />
                </div>
              )}

              {analysisLog.rawResponse && (
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">After — Arabic Fields</div>
                  <ExpandableText label="translated fields" text={analysisLog.rawResponse} maxLen={1500} />
                </div>
              )}

              {/* Show the resulting Arabic fields */}
              {article.analysis && (article.analysis.topicAr || article.analysis.summaryAr) && (
                <div className="rounded-lg border border-purple/20 bg-purple/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-purple font-bold uppercase tracking-wider">Translated Fields Result</div>
                  {article.analysis.topicAr && <div className="text-[11px]" dir="rtl"><span className="text-dim font-mono">topic:</span> {article.analysis.topicAr}</div>}
                  {article.analysis.summaryAr && <div className="text-[11px]" dir="rtl"><span className="text-dim font-mono">summary:</span> {article.analysis.summaryAr}</div>}
                  {article.analysis.regionAr && <div className="text-[11px]" dir="rtl"><span className="text-dim font-mono">region:</span> {article.analysis.regionAr}</div>}
                  {article.analysis.uniqueAngleAr && <div className="text-[11px]" dir="rtl"><span className="text-dim font-mono">uniqueAngle:</span> {article.analysis.uniqueAngleAr}</div>}
                  {article.analysis.tagsAr && article.analysis.tagsAr.length > 0 && (
                    <div className="flex flex-wrap gap-1" dir="rtl">
                      <span className="text-dim font-mono text-[11px]">tags:</span>
                      {article.analysis.tagsAr.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-purple/10 text-purple text-[10px] font-mono">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {analysisLog.status === "skipped" && (
            <div className="text-[11px] text-dim font-mono">{analysisLog.reason || "Skipped"}</div>
          )}
        </div>
      )}

      {/* Step 4: Translate research brief */}
      {researchLog && (
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
          <StepHeader entry={researchLog} label="Translate Research Brief" icon={Search} />

          {researchLog.status === "ok" && (
            <>
              <div className="flex items-center gap-4 text-[11px] font-mono text-dim">
                {researchLog.inputChars != null && <span>Input: {researchLog.inputChars.toLocaleString()} chars (EN)</span>}
                {researchLog.outputChars != null && <span>→ Output: {researchLog.outputChars.toLocaleString()} chars (AR)</span>}
              </div>

              {researchLog.promptSent && (
                <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Before — Brief sent to AI</div>
                  <ExpandableText label="brief JSON" text={researchLog.promptSent} maxLen={1500} />
                </div>
              )}

              {researchLog.rawResponse && (
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1.5">
                  <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">After — Arabic Brief</div>
                  <ExpandableText label="translated brief" text={researchLog.rawResponse} maxLen={1500} />
                </div>
              )}
            </>
          )}

          {researchLog.status === "skipped" && (
            <div className="text-[11px] text-dim font-mono">{researchLog.reason || "Skipped"}</div>
          )}

          {researchLog.status === "failed" && researchLog.error && (
            <div className="text-[11px] font-mono text-destructive">{researchLog.error}</div>
          )}
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

  return (
    <div className="p-4 space-y-4">
      {/* Header: processor + model + tokens */}
      {classifyLog && <StepHeader entry={classifyLog} label="Classification" icon={Brain} />}

      {/* Quality evaluation */}
      {classifyLog?.quality && <QualityBadge quality={classifyLog.quality} />}

      {/* Before AI: what was sent */}
      {classifyLog?.promptSent && (
        <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1.5">
          <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Before — Sent to AI</div>
          <div className="text-[10px] font-mono text-dim">{classifyLog.inputChars?.toLocaleString()} chars article text → {classifyLog.service || "Claude Haiku"}</div>
          <ExpandableText label="full prompt" text={classifyLog.promptSent} maxLen={1500} />
        </div>
      )}

      {/* After AI: what came back */}
      {classifyLog?.rawResponse && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1.5">
          <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">After — AI Response (original language)</div>
          <ExpandableText label="raw response" text={classifyLog.rawResponse} maxLen={1500} />
        </div>
      )}

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

      {/* Classification grid */}
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <InfoCard label="Sentiment" value={analysis.sentiment || "—"} color={
          analysis.sentiment === "positive" ? "text-success" :
          analysis.sentiment === "negative" ? "text-destructive" : "text-dim"
        } />
        <InfoCard label="Content Type" value={analysis.contentType || "—"} />
        <InfoCard label="Breaking" value={analysis.isBreaking ? "Yes" : "No"} color={
          analysis.isBreaking ? "text-orange" : "text-dim"
        } />
      </div>

      {/* Unique angle */}
      {analysis.uniqueAngle && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Unique Angle (original language)</div>
          <div className="text-[12px] text-foreground/80 italic" dir="auto">{analysis.uniqueAngle}</div>
        </div>
      )}

      {/* AI scores */}
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider">AI Assessment</div>
      <div className="grid grid-cols-2 gap-3">
        <ScoreGauge label="Viral Potential" value={analysis.viralPotential} />
        <ScoreGauge label="Relevance" value={analysis.relevance} />
      </div>
    </div>
  );
}

function ScoringDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const scoreLog = log.find((e) => e.step === "score");

  if (!scoreLog) {
    return <div className="p-4 text-[12px] text-dim font-mono">No scoring data yet.</div>;
  }

  const relevance = scoreLog.relevance ?? 0;
  const viral = scoreLog.viralPotential ?? 0;
  const freshness = scoreLog.freshness ?? 0;
  const prefBias = scoreLog.preferenceBias ?? 0;
  const rank = scoreLog.rankScore ?? 0;

  return (
    <div className="p-4 space-y-4">
      <StepHeader entry={scoreLog} label="Scoring" icon={Sparkles} />
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Score Breakdown</div>
      <div className="space-y-2">
        <ScoreRow label="Relevance" value={relevance} weight={0.35} result={relevance * 0.35} />
        <ScoreRow label="Viral Potential" value={viral} weight={0.30} result={viral * 0.30} />
        <ScoreRow label="Freshness" value={freshness} weight={0.35} result={freshness * 0.35} />
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border">
        <span className="text-[12px] font-mono text-dim">Raw Score</span>
        <span className="text-[13px] font-mono font-semibold">{(relevance * 0.35 + viral * 0.30 + freshness * 0.35).toFixed(3)}</span>
      </div>

      {prefBias !== 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border">
          <span className="text-[12px] font-mono text-dim">Preference Bias</span>
          <span className={`text-[13px] font-mono font-semibold ${prefBias > 0 ? "text-success" : "text-destructive"}`}>
            {prefBias > 0 ? "+" : ""}{prefBias.toFixed(3)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-3 rounded-lg border-2 border-success/30 bg-success/5">
        <span className="text-[13px] font-semibold text-foreground">Final Rank Score</span>
        <span className="text-[18px] font-mono font-bold text-success">{rank.toFixed(2)}</span>
      </div>

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
  const promoteLog = log.find((e) => e.step === "promote");

  if (!promoteLog) {
    return <div className="p-4 text-[12px] text-dim font-mono">No promotion data yet.</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <StepHeader entry={promoteLog} label={
        promoteLog.status === "created" ? "Story Created" :
        promoteLog.status === "linked" ? "Linked to Existing" :
        promoteLog.status === "skipped" ? "Skipped" :
        promoteLog.status === "failed" ? "Failed" : "Promotion"
      } icon={CheckCircle2} />

      {promoteLog.status === "created" && article.storyId && (
        <Link to={pp(`/story/${article.storyId}`)}
          className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/5 border border-success/20 hover:bg-success/10 transition-colors">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">Story Created Successfully</div>
            <div className="text-[11px] font-mono text-dim mt-0.5">Click to view the story</div>
          </div>
          <ArrowLeft className="w-4 h-4 text-dim ml-auto rotate-180" />
        </Link>
      )}

      {promoteLog.status === "linked" && (
        <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border text-[12px] text-dim">
          Article was linked to an existing story with the same headline.
        </div>
      )}

      {promoteLog.status === "skipped" && promoteLog.reason && (
        <div className="px-3 py-2 rounded-lg bg-orange/5 border border-orange/20 text-[12px] text-orange">
          {promoteLog.reason}
        </div>
      )}

      {promoteLog.status === "failed" && promoteLog.error && (
        <div className="px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-[12px] text-destructive font-mono">
          {promoteLog.error}
        </div>
      )}
    </div>
  );
}

/* ─── Research Detail ─── */

function ResearchDetail({ article, log, pp }: { article: ArticleDetail; log: LogEntry[]; pp: (p: string) => string }) {
  const decisionLog = log.find(e => e.step === "research_decision");
  const researchLog = log.find(e => e.step === "research");
  const fcLog = log.find(e => e.step === "firecrawl_search");
  const pxLog = log.find(e => e.step === "perplexity_context");
  const simLog = log.find(e => e.step === "db_similarity");
  const synthLog = log.find(e => e.step === "synthesis");
  const research = (article.analysis as Analysis | null)?.research;
  const brief = research?.brief;

  if (!decisionLog) {
    return <div className="p-4 text-[12px] text-dim font-mono">No research data yet.</div>;
  }

  if (!decisionLog.needed) {
    return (
      <div className="p-4 space-y-3">
        <StepHeader entry={decisionLog} label="Research Decision" icon={Search} />
        <div className="text-[12px] text-dim">{decisionLog.reason}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Decision */}
      <StepHeader entry={decisionLog} label="Research Decision" icon={Search} />

      {/* ── Narrative Strength banner ── */}
      {researchLog && (
        <div className={`px-4 py-3 rounded-lg border-2 ${
          researchLog.status === "ok" ? "border-success/30 bg-success/5" :
          researchLog.status === "partial" ? "border-orange/30 bg-orange/5" :
          "border-destructive/30 bg-destructive/5"
        }`}>
          <div className="flex items-center justify-between">
            <StatusBadge status={researchLog.status} label={
              researchLog.status === "ok" ? "Research Complete" :
              researchLog.status === "partial" ? "Partially Researched" : "Failed"
            } />
            {(researchLog.narrativeStrength != null || brief?.narrativeStrength != null) && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dim font-mono">Narrative Strength</span>
                <span className="text-[18px] font-mono font-bold text-success">
                  {brief?.narrativeStrength ?? researchLog.narrativeStrength}/10
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Service Call Log ── */}
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Service Calls (step by step)</div>

        {/* 1. Firecrawl Web Search */}
        {fcLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
            <StepHeader entry={fcLog} label="Web Search" icon={Search} />
            {fcLog.query && (
              <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Query sent to Firecrawl</div>
                <div className="text-[12px] text-foreground font-mono leading-relaxed break-all">{fcLog.query}</div>
              </div>
            )}
            {fcLog.titles && fcLog.titles.length > 0 && (
              <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">Results ({fcLog.resultsCount})</div>
                {fcLog.titles.map((t, i) => (
                  <div key={i} className="text-[11px] font-mono text-foreground/80">{i + 1}. {t}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Perplexity Background */}
        {pxLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
            <StepHeader entry={pxLog} label="Background Context" icon={Brain} />
            {pxLog.quality && <QualityBadge quality={pxLog.quality} />}
            {pxLog.promptSent && (
              <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Sent to AI</div>
                <ExpandableText label="full prompt" text={pxLog.promptSent} maxLen={1500} />
              </div>
            )}
            {pxLog.rawResponse && (
              <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">AI Response ({pxLog.chars?.toLocaleString()} chars, {pxLog.citations} citations)</div>
                <ExpandableText label="response text" text={pxLog.rawResponse} maxLen={1500} />
              </div>
            )}
            {!pxLog.rawResponse && pxLog.status === "ok" && (
              <div className="text-[10px] font-mono text-dim">{pxLog.chars?.toLocaleString()} chars · {pxLog.citations} citations</div>
            )}
          </div>
        )}

        {/* 3. DB Similarity */}
        {simLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-1.5">
            <StepHeader entry={simLog} label="Similarity Search" icon={Target} />
            {simLog.embeddingInputChars && (
              <div className="text-[10px] font-mono text-dim">Embedded {simLog.embeddingInputChars.toLocaleString()} chars via OpenAI</div>
            )}
            {simLog.matchCount != null && (
              <div className="text-[10px] font-mono text-dim">{simLog.matchCount} similar videos found</div>
            )}
            {simLog.topMatch && (
              <div className="text-[10px] font-mono text-dim">Top match: {simLog.topMatch}</div>
            )}
          </div>
        )}

        {/* 4. Claude Synthesis */}
        {synthLog && (
          <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border space-y-2">
            <StepHeader entry={synthLog} label="AI Synthesis" icon={Sparkles} />
            {synthLog.quality && <QualityBadge quality={synthLog.quality} />}
            {synthLog.promptSent && (
              <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-blue font-bold uppercase tracking-wider">Sent to AI</div>
                <ExpandableText label="full prompt" text={synthLog.promptSent} maxLen={1500} />
              </div>
            )}
            {synthLog.rawResponse && (
              <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
                <div className="text-[10px] font-mono text-success font-bold uppercase tracking-wider">AI Response</div>
                <ExpandableText label="raw response" text={synthLog.rawResponse} maxLen={1500} />
              </div>
            )}
            {synthLog.briefKeys && synthLog.briefKeys.length > 0 && (
              <div className="text-[10px] font-mono text-dim">Output keys: {synthLog.briefKeys.join(", ")}</div>
            )}
          </div>
        )}
      </div>

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
