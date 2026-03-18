import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  RotateCw, Pause, Play, Circle, AlertTriangle, ArrowUpRight,
  ExternalLink, SkipForward, Trash2, ClipboardPaste, X, Loader2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

/* ─── Types ─── */

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
  source?: ArticleSource | null;
}

interface PipelineData {
  stats: {
    total: number;
    imported: number;
    content: number;
    translated: number;
    ai_analysis: number;
    review: number;
    done: number;
    failed: number;
  };
  byStage: Record<string, ApiArticle[]>;
  paused: boolean;
}

const STAGE_DEFS: { id: string; number: number; label: string; color: string }[] = [
  { id: "imported",     number: 1, label: "Imported",     color: "text-orange" },
  { id: "content",      number: 2, label: "Content",      color: "text-blue" },
  { id: "translated",   number: 3, label: "Translated",   color: "text-purple" },
  { id: "ai_analysis",  number: 4, label: "AI Analysis",  color: "text-success" },
  { id: "review",       number: 0, label: "Review",       color: "text-orange" },
  { id: "failed",       number: 0, label: "Failed",       color: "text-destructive" },
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatElapsed(from: Date): string {
  const ms = Date.now() - from.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const LANG_LABELS: Record<string, string> = {
  ar: "AR", en: "EN", es: "ES", fr: "FR", de: "DE", tr: "TR", zh: "ZH", ja: "JA", ko: "KO",
};

/* ─── Main Component ─── */

export default function ArticlePipeline() {
  const { projectId } = useParams();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const fetchPipeline = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/article-pipeline?projectId=${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: PipelineData) => {
        setData(d);
        setPaused(d.paused);
      })
      .catch(() => toast.error("Failed to load article pipeline"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  useEffect(() => {
    setCountdown(30);
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { fetchPipeline(); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchPipeline]);

  const handlePauseResume = () => {
    const endpoint = paused ? "/api/article-pipeline/resume" : "/api/article-pipeline/pause";
    fetch(endpoint, { method: "POST", credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); setPaused(!paused); toast.success(paused ? "Pipeline resumed" : "Pipeline paused"); })
      .catch(() => toast.error("Failed to update pipeline state"));
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
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} failed articles`); fetchPipeline(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  const failedCount = data?.stats.failed ?? 0;
  const reviewCount = data?.stats.review ?? 0;
  const totalArticles = data?.stats.total ?? 0;
  const doneCount = data?.stats.done ?? 0;
  const inPipeline = totalArticles - doneCount;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-medium text-foreground">Article Pipeline</h1>
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
                  <div className="text-2xl font-semibold font-mono tracking-tight">{totalArticles}</div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Total Articles</div>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-dim font-mono">
                    <span>{inPipeline} in pipeline</span>
                    <span>{doneCount} done</span>
                  </div>
                </div>
                {STAGE_DEFS.filter(s => s.number > 0).map((stage) => {
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
                {reviewCount > 0 && (
                  <div className="px-5 py-4 bg-background border-r border-border">
                    <span className="text-2xl font-semibold font-mono tracking-tight text-orange">{reviewCount}</span>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Review</div>
                  </div>
                )}
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
                    onRefresh={fetchPipeline}
                    projectId={projectId}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1 items-start">
                {STAGE_DEFS.slice(3).map((stage) => (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    items={data?.byStage[stage.id] ?? []}
                    onRefresh={fetchPipeline}
                    projectId={projectId}
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

/* ─── Stage Column ─── */

function StageColumn({
  stage,
  items,
  onRefresh,
  projectId,
}: {
  stage: { id: string; number: number; label: string; color: string };
  items: ApiArticle[];
  onRefresh: () => void;
  projectId: string | undefined;
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
      .then((d: { retried: number }) => { toast.success(`Retrying ${d.retried} items`); onRefresh(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetryingAll(false));
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col" style={{ height: "420px" }}>
      {/* Stage header */}
      <div className="px-4 py-3 bg-background shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              isFailed ? "bg-destructive/15 text-destructive" :
              isReview ? "bg-orange/15 text-orange" :
              "bg-primary/15 text-primary"
            }`}>
              {isFailed ? <AlertTriangle className="w-3 h-3" /> :
               isReview ? "!" :
               stage.number}
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
            <ArticleItemRow
              key={item.id}
              article={item}
              isFailed={isFailed}
              isReview={isReview}
              onRefresh={onRefresh}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Article Item Row ─── */

function ArticleItemRow({
  article,
  isFailed,
  isReview,
  onRefresh,
}: {
  article: ApiArticle;
  isFailed: boolean;
  isReview: boolean;
  onRefresh: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);

  const domain = extractDomain(article.url);
  const langLabel = LANG_LABELS[article.language || ""] || article.language || "";
  const timeInStage = article.startedAt ? formatElapsed(new Date(article.startedAt)) : undefined;

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    fetch(`/api/article-pipeline/${article.id}/retry`, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Queued for retry"); onRefresh(); })
      .catch(() => toast.error("Failed to retry"))
      .finally(() => setRetrying(false));
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSkipping(true);
    fetch(`/api/article-pipeline/${article.id}/skip`, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Skipped to next stage"); onRefresh(); })
      .catch(() => toast.error("Failed to skip"))
      .finally(() => setSkipping(false));
  };

  const handleDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropping(true);
    fetch(`/api/article-pipeline/${article.id}/drop`, { method: "POST", credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Article dropped"); onRefresh(); })
      .catch(() => toast.error("Failed to drop"))
      .finally(() => setDropping(false));
  };

  const handlePaste = () => {
    if (pasteText.trim().length < 50) { toast.error("Content must be at least 50 characters"); return; }
    setPasting(true);
    fetch(`/api/article-pipeline/${article.id}/content`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pasteText.trim() }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { toast.success("Content saved"); setShowPaste(false); setPasteText(""); onRefresh(); })
      .catch(() => toast.error("Failed to save content"))
      .finally(() => setPasting(false));
  };

  return (
    <div className="block px-4 py-3 border-t border-border hover:bg-surface/50 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        {/* Left: status */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="min-w-0">
            {article.status === "running" && !isFailed && !isReview && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
                <span className="text-[11px] text-success font-mono">Processing…</span>
              </div>
            )}
            {article.status === "queued" && !isFailed && !isReview && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-dim/50 shrink-0" />
                <span className="text-[11px] text-dim font-mono">Queued</span>
              </div>
            )}
            {isReview && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange shrink-0" />
                <span className="text-[11px] text-orange font-mono truncate max-w-[120px]">{article.error || "Needs review"}</span>
              </div>
            )}
            {isFailed && article.error && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-[11px] text-destructive/80 font-mono truncate max-w-[120px]">{article.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: title */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[13px] text-foreground font-medium text-right truncate" dir="auto">
            {article.title || domain || article.id.slice(0, 8)}
          </span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ExternalLink className="w-3 h-3 text-dim hover:text-sensor" />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-dim font-mono">
          {timeInStage && <span>⏱ {timeInStage}</span>}
          {domain && <span>{domain}</span>}
          {langLabel && (
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              article.language === "ar" ? "bg-success/15 text-success" : "bg-blue/15 text-blue"
            }`}>
              {langLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {article.retries > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[10px] text-dim font-mono">
                    <RotateCw className="w-2.5 h-2.5" />
                    {article.retries}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">Attempted {article.retries} times</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {article.rankScore != null && article.rankScore > 0 && (
            <span className="text-[10px] font-mono text-success">{article.rankScore.toFixed(2)}</span>
          )}
          {(isFailed || isReview) && (
            <button onClick={handleRetry} disabled={retrying}
              className="text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
              {retrying ? "…" : "Retry"}
            </button>
          )}
        </div>
      </div>

      {/* Review actions */}
      {isReview && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
          <button onClick={handleSkip} disabled={skipping}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-blue border border-blue/20 bg-blue/5 hover:bg-blue/10 transition-colors disabled:opacity-50">
            {skipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />} Skip
          </button>
          <button onClick={handleDrop} disabled={dropping}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors disabled:opacity-50">
            {dropping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Drop
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowPaste(!showPaste); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-purple border border-purple/20 bg-purple/5 hover:bg-purple/10 transition-colors">
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>
        </div>
      )}

      {/* Paste modal */}
      {showPaste && (
        <div className="mt-2 p-3 rounded-lg border border-purple/20 bg-purple/5">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the article content here..."
            className="w-full h-24 bg-background border border-border rounded-lg p-2 text-[12px] font-mono resize-none focus:outline-none focus:border-purple/50"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-dim font-mono">{pasteText.length} chars</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowPaste(false); setPasteText(""); }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-dim font-mono hover:text-foreground">
                <X className="w-3 h-3" /> Cancel
              </button>
              <button onClick={handlePaste} disabled={pasting || pasteText.trim().length < 50}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-mono text-purple bg-purple/15 hover:bg-purple/25 transition-colors disabled:opacity-50">
                {pasting ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
