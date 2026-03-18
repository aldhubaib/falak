import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useProjectPath } from "@/hooks/useProjectPath";
import {
  ArrowLeft, ExternalLink, FileText, Globe, Languages, Brain,
  Sparkles, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight,
  Copy, Check, Search, Target,
} from "lucide-react";
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
  topMatch?: string | null;
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
  raw?: string;
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
  { id: "classify", label: "Classification", icon: Brain, color: "text-success", bgColor: "bg-success" },
  { id: "research", label: "Research (Original Language)", icon: Search, color: "text-purple", bgColor: "bg-purple" },
  { id: "translated", label: "Translation", icon: Languages, color: "text-blue", bgColor: "bg-blue" },
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
  translated: ["detect_language", "translate"],
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

/* ─── Stage detail components ─── */

function ImportedDetail({ article, log }: { article: ArticleDetail; log: LogEntry[] }) {
  const importedLog = log.find((e) => e.step === "imported");

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
        {importedLog && <StatusBadge status={importedLog.status} label="Imported" />}
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
      {/* Service attempts */}
      <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Service Attempts</div>
      <div className="space-y-2">
        {/* Apify check */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-orange" />
            <span className="text-[12px] font-medium">Apify Content</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            {apifyLog && (
              <>
                <span className="text-dim">{apifyLog.chars?.toLocaleString()} chars</span>
                <span className="text-dim">/ {apifyLog.threshold?.toLocaleString()} needed</span>
                <StatusBadge status={apifySufficient ? "ok" : "failed"} label={apifySufficient ? "Sufficient" : "Too short"} />
              </>
            )}
          </div>
        </div>

        {/* Firecrawl */}
        {firecrawlLog && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-blue" />
              <span className="text-[12px] font-medium">Firecrawl</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {firecrawlLog.chars != null && <span className="text-dim">{firecrawlLog.chars.toLocaleString()} chars</span>}
              {firecrawlLog.reason && <span className="text-dim">{firecrawlLog.reason}</span>}
              {firecrawlLog.error && <span className="text-destructive/70 truncate max-w-[200px]">{firecrawlLog.error}</span>}
              <StatusBadge status={firecrawlLog.status} />
            </div>
          </div>
        )}

        {/* HTML Fetch */}
        {htmlLog && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 border border-border">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-purple" />
              <span className="text-[12px] font-medium">HTML Fetch</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {htmlLog.chars != null && <span className="text-dim">{htmlLog.chars.toLocaleString()} chars</span>}
              {htmlLog.error && <span className="text-destructive/70 truncate max-w-[200px]">{htmlLog.error}</span>}
              <StatusBadge status={htmlLog.status} />
            </div>
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
  const translateLog = log.find((e) => e.step === "translate");

  return (
    <div className="p-4 space-y-4">
      {/* Language detection */}
      {detectLog && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
          <Languages className="w-4 h-4 text-purple" />
          <span className="text-[12px] font-medium">Language Detected:</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            detectLog.detected === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
          }`}>
            {(detectLog.detected || "unknown").toUpperCase()}
          </span>
        </div>
      )}

      {/* Translation status */}
      {translateLog && (
        <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium">Translation</span>
              <StatusBadge status={translateLog.status} label={
                translateLog.status === "skipped" ? "Skipped (already Arabic)" :
                translateLog.status === "ok" ? "Translated" : translateLog.status
              } />
            </div>
            {translateLog.model && (
              <span className="text-[10px] font-mono text-blue">{translateLog.model}</span>
            )}
          </div>
          {translateLog.status === "ok" && (
            <div className="flex items-center gap-4 mt-2 text-[11px] font-mono text-dim">
              <span>Input: {translateLog.inputChars?.toLocaleString()} chars ({translateLog.inputLang?.toUpperCase()})</span>
              <span>→</span>
              <span>Output: {translateLog.outputChars?.toLocaleString()} chars (AR)</span>
            </div>
          )}
        </div>
      )}

      {/* Content comparison */}
      {translateLog?.status === "ok" && (
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

      {translateLog?.status === "skipped" && article.contentAr && (
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
    return (
      <div className="p-4 text-[12px] text-dim font-mono">No classification data yet.</div>
    );
  }

  if (analysis.parseError) {
    return (
      <div className="p-4 space-y-3">
        <StatusBadge status="failed" label="Parse Error" />
        {analysis.raw && (
          <ContentBlock label="Raw AI Response (failed to parse)" content={analysis.raw} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {classifyLog && (
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <StatusBadge status={classifyLog.status} label={classifyLog.status === "ok" ? "Classified" : classifyLog.status} />
          <span className="text-dim">via Claude Haiku</span>
        </div>
      )}

      {/* Topic */}
      {analysis.topic && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Topic Summary</div>
          <div className="text-[14px] text-foreground font-medium leading-relaxed" dir="rtl">{analysis.topic}</div>
        </div>
      )}

      {/* Summary */}
      {analysis.summary && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Summary</div>
          <div className="text-[12px] text-foreground/80 leading-relaxed" dir="rtl">{analysis.summary}</div>
        </div>
      )}

      {/* Tags */}
      {analysis.tags && analysis.tags.length > 0 && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-2">Tags</div>
          <div className="flex flex-wrap gap-1.5" dir="rtl">
            {analysis.tags.map((tag, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-mono">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Classification grid */}
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <InfoCard label="Sentiment" value={analysis.sentiment || "—"} color={
          analysis.sentiment === "positive" ? "text-success" :
          analysis.sentiment === "negative" ? "text-destructive" : "text-dim"
        } />
        <InfoCard label="Content Type" value={analysis.contentType || "—"} />
        <InfoCard label="Region" value={analysis.region || "—"} dir="rtl" />
        <InfoCard label="Breaking" value={analysis.isBreaking ? "Yes" : "No"} color={
          analysis.isBreaking ? "text-orange" : "text-dim"
        } />
      </div>

      {/* Unique angle */}
      {analysis.uniqueAngle && (
        <div>
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider mb-1">Unique Angle</div>
          <div className="text-[12px] text-foreground/80 italic" dir="rtl">{analysis.uniqueAngle}</div>
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
      {/* Formula breakdown */}
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
      <div className="flex items-center gap-2">
        <StatusBadge status={promoteLog.status} label={
          promoteLog.status === "created" ? "Story Created" :
          promoteLog.status === "linked" ? "Linked to Existing" :
          promoteLog.status === "skipped" ? "Skipped" :
          promoteLog.status === "failed" ? "Failed" : promoteLog.status
        } />
      </div>

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
  const searchLog = log.find(e => e.step === "firecrawl_search");
  const contextLog = log.find(e => e.step === "perplexity_context");
  const similarityLog = log.find(e => e.step === "db_similarity");
  const synthesisLog = log.find(e => e.step === "synthesis");
  const researchLog = log.find(e => e.step === "research");
  const saveLog = log.find(e => e.step === "save_research");

  if (!decisionLog) {
    return <div className="p-4 text-[12px] text-dim font-mono">No research data yet.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Decision */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-purple" />
          <span className="text-[12px] font-medium">Research Decision</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <StatusBadge status={decisionLog.needed ? "ok" : "skipped"} label={decisionLog.needed ? "Research Needed" : "Skipped"} />
        </div>
      </div>
      {!decisionLog.needed && (
        <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border text-[12px] text-dim font-mono">
          {decisionLog.reason}
        </div>
      )}

      {decisionLog.needed && (
        <>
          {/* Firecrawl Search */}
          <div className="text-[10px] font-mono text-dim uppercase tracking-wider">Research Sources</div>
          <div className="space-y-2">
            {searchLog && (
              <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-blue" />
                    <span className="text-[12px] font-medium">Web Search (Firecrawl)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    {searchLog.query && <span className="text-dim truncate max-w-[200px]">"{searchLog.query}"</span>}
                    <StatusBadge status={searchLog.status} />
                  </div>
                </div>
                {searchLog.status === "ok" && searchLog.titles && searchLog.titles.length > 0 && (
                  <div className="space-y-1 mt-2 pl-6">
                    {searchLog.titles.map((title, i) => (
                      <div key={i} className="text-[11px] text-foreground/70 truncate">
                        <span className="text-blue mr-1">{i + 1}.</span> {title}
                      </div>
                    ))}
                  </div>
                )}
                {searchLog.error && (
                  <div className="text-[10px] text-destructive/70 font-mono mt-1 pl-6">{searchLog.error}</div>
                )}
              </div>
            )}

            {/* Perplexity Context */}
            {contextLog && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-orange" />
                  <span className="text-[12px] font-medium">Background Context (Perplexity)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  {contextLog.chars != null && <span className="text-dim">{contextLog.chars.toLocaleString()} chars</span>}
                  {contextLog.citations != null && <span className="text-dim">{contextLog.citations} citations</span>}
                  <StatusBadge status={contextLog.status} />
                </div>
              </div>
            )}

            {/* DB Similarity */}
            {similarityLog && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-purple" />
                  <span className="text-[12px] font-medium">Similar Competition Videos</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  {similarityLog.matchCount != null && <span className="text-dim">{similarityLog.matchCount} matches</span>}
                  {similarityLog.topMatch && <span className="text-dim truncate max-w-[150px]" dir="auto">Top: {similarityLog.topMatch}</span>}
                  <StatusBadge status={similarityLog.status} />
                </div>
              </div>
            )}
          </div>

          {/* Synthesis */}
          {synthesisLog && (
            <>
              <div className="text-[10px] font-mono text-dim uppercase tracking-wider">AI Synthesis</div>
              <div className="px-3 py-2.5 rounded-lg bg-surface/50 border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-success" />
                    <span className="text-[12px] font-medium">Research Brief</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    {synthesisLog.model && <span className="text-blue">{synthesisLog.model}</span>}
                    <StatusBadge status={synthesisLog.status} label={synthesisLog.status === "ok" ? "Generated" : synthesisLog.status} />
                  </div>
                </div>
                {synthesisLog.briefKeys && synthesisLog.briefKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                    {synthesisLog.briefKeys.map((key, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-success/10 text-success text-[9px] font-mono">
                        {key}
                      </span>
                    ))}
                  </div>
                )}
                {synthesisLog.error && (
                  <div className="text-[10px] text-destructive/70 font-mono mt-1 pl-6">{synthesisLog.error}</div>
                )}
              </div>
            </>
          )}

          {/* Overall research status */}
          {researchLog && (
            <div className={`px-3 py-2.5 rounded-lg border-2 ${
              researchLog.status === "ok" ? "border-success/30 bg-success/5" :
              researchLog.status === "partial" ? "border-orange/30 bg-orange/5" :
              "border-destructive/30 bg-destructive/5"
            }`}>
              <div className="flex items-center gap-2">
                <StatusBadge status={researchLog.status} label={
                  researchLog.status === "ok" ? "Research Complete" :
                  researchLog.status === "partial" ? "Partially Researched" :
                  researchLog.status === "skipped" ? "Skipped" : "Failed"
                } />
                {researchLog.narrativeStrength != null && (
                  <span className="text-[11px] font-mono text-dim">
                    Narrative Strength: <span className="font-semibold text-foreground">{researchLog.narrativeStrength}/10</span>
                  </span>
                )}
              </div>
              {researchLog.status === "failed" && researchLog.error && (
                <div className="text-[10px] text-destructive/70 font-mono mt-1">{researchLog.error}</div>
              )}
            </div>
          )}

          {/* Save status */}
          {saveLog && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <StatusBadge status={saveLog.status} label={saveLog.status === "ok" ? "Saved to Story" : "Save Failed"} />
              {saveLog.storyId && article.storyId && (
                <Link to={pp(`/story/${article.storyId}`)} className="text-blue hover:underline">
                  View enriched story
                </Link>
              )}
            </div>
          )}
        </>
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
