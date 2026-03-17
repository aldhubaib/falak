import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { RotateCw, Loader2, Play, AlertTriangle, ExternalLink, Circle, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface ArticleData {
  id: string;
  url: string;
  title: string | null;
  stage: string;
  status: string;
  error: string | null;
  retries: number;
  publishedAt: string | null;
  language: string | null;
  relevanceScore: number | null;
  rankScore: number | null;
  rankReason: string | null;
  createdAt: string;
}

interface SourcePipeline {
  source: {
    id: string;
    type: string;
    label: string;
    language: string;
    isActive: boolean;
    lastPolledAt: string | null;
    config: Record<string, unknown>;
  };
  stats: Record<string, number>;
  articles: ArticleData[];
}

interface PipelineResponse {
  sources: SourcePipeline[];
  totals: Record<string, number>;
}

const STAGE_DEFS = [
  { id: "clean",      label: "Clean",    color: "text-orange",  bg: "bg-orange/15" },
  { id: "classify",   label: "Classify", color: "text-blue",    bg: "bg-blue/15" },
  { id: "rank_pool",  label: "Pool",     color: "text-purple",  bg: "bg-purple/15" },
  { id: "ranked",     label: "Ranked",   color: "text-success", bg: "bg-success/15" },
  { id: "done",       label: "Done",     color: "text-emerald-400", bg: "bg-emerald-400/15" },
  { id: "failed",     label: "Failed",   color: "text-destructive", bg: "bg-destructive/15" },
];

export default function ArticlePipeline() {
  const { projectId } = useParams();
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestingSource, setIngestingSource] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchPipeline = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/article-pipeline?projectId=${projectId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: PipelineResponse) => setData(d))
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

  const handleIngestAll = () => {
    setIngesting(true);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => {
        const total = d.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) || 0;
        toast.success(`Ingested ${total} new articles from ${d.results?.length || 0} sources`);
        fetchPipeline();
      })
      .catch((e) => toast.error(e?.error || "Ingest failed"))
      .finally(() => setIngesting(false));
  };

  const handleIngestSource = (sourceId: string) => {
    setIngestingSource(sourceId);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sourceId }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => {
        const r = d.results?.[0];
        if (r?.error) toast.error(`${r.label}: ${r.error}`);
        else toast.success(`${r?.label}: ${r?.inserted || 0} new articles`);
        fetchPipeline();
      })
      .catch((e) => toast.error(e?.error || "Ingest failed"))
      .finally(() => setIngestingSource(null));
  };

  const handleRetryAllFailed = () => {
    fetch("/api/article-pipeline/retry-all-failed", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { toast.success(`Retrying ${d.retried} articles`); fetchPipeline(); })
      .catch(() => toast.error("Failed to retry"));
  };

  const totalArticles = data ? Object.values(data.totals).reduce((s, c) => s + c, 0) : 0;
  const failedCount = data?.totals.failed || 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-medium text-foreground">Article Pipeline</h1>
          <span className="text-[11px] text-dim font-mono">Brain v3</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-success/15 text-success">
            <Circle className="w-2 h-2 fill-current" />
            {countdown}s
          </span>
          {failedCount > 0 && (
            <button onClick={handleRetryAllFailed}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors">
              <RotateCw className="w-3 h-3" /> Retry failed ({failedCount})
            </button>
          )}
          <button onClick={handleIngestAll} disabled={ingesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue text-blue-foreground text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {ingesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Ingest All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-sensor border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data || data.sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <span className="text-[13px] text-dim">No article sources configured.</span>
            <span className="text-[12px] text-dim font-mono">Go to Source → Add Source to create one.</span>
          </div>
        ) : (
          <>
            {/* Global stats bar */}
            <div className="px-6 max-lg:px-4 pt-5 mb-5">
              <div className="flex rounded-xl overflow-hidden border border-border">
                <div className="px-5 py-4 bg-background border-r border-border min-w-[120px]">
                  <div className="text-2xl font-semibold font-mono tracking-tight">{totalArticles}</div>
                  <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">Total Articles</div>
                </div>
                {STAGE_DEFS.map((stage) => (
                  <div key={stage.id} className="flex-1 px-4 py-4 bg-background border-r border-border last:border-r-0">
                    <span className={`text-2xl font-semibold font-mono tracking-tight ${stage.color}`}>{data.totals[stage.id] || 0}</span>
                    <div className="text-[10px] text-dim font-mono uppercase tracking-wider mt-1">{stage.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-source pipeline lanes */}
            <div className="px-6 max-lg:px-4 pb-8 space-y-4">
              {data.sources.map((sp) => (
                <SourceLane
                  key={sp.source.id}
                  data={sp}
                  onIngest={() => handleIngestSource(sp.source.id)}
                  ingesting={ingestingSource === sp.source.id}
                  onRefresh={fetchPipeline}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SourceLane({ data, onIngest, ingesting, onRefresh }: {
  data: SourcePipeline;
  onIngest: () => void;
  ingesting: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const { source, stats, articles } = data;

  const totalForSource = Object.values(stats).reduce((s, c) => s + c, 0);
  const stageArticles = activeStage ? articles.filter(a => a.stage === activeStage) : articles;

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${source.isActive ? "border-border" : "border-border opacity-50"}`}>
      {/* Source header */}
      <div className="px-5 py-3 bg-background flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setExpanded(!expanded)} className="text-dim hover:text-sensor transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className={`w-2 h-2 rounded-full ${source.isActive ? "bg-blue" : "bg-zinc-600"}`} />
          <span className="text-[13px] font-semibold">{source.label}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{source.type}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{source.language}</span>
          <span className="text-[11px] text-dim font-mono">{totalForSource} articles</span>
        </div>
        <div className="flex items-center gap-2">
          {source.lastPolledAt && (
            <span className="text-[10px] text-dim font-mono">Last: {new Date(source.lastPolledAt).toLocaleTimeString()}</span>
          )}
          <button onClick={onIngest} disabled={ingesting || !source.isActive}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-dim font-medium hover:text-sensor transition-colors disabled:opacity-50">
            {ingesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Ingest
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Stage pills */}
          <div className="px-5 py-2 bg-background border-t border-border flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveStage(null)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-colors shrink-0 ${activeStage === null ? "bg-foreground/10 text-foreground" : "text-dim hover:text-sensor"}`}>
              All ({totalForSource})
            </button>
            {STAGE_DEFS.map((stage) => {
              const count = stats[stage.id] || 0;
              if (count === 0 && stage.id !== "failed") return null;
              return (
                <button key={stage.id} onClick={() => setActiveStage(stage.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium transition-colors shrink-0 ${activeStage === stage.id ? `${stage.bg} ${stage.color}` : "text-dim hover:text-sensor"}`}>
                  {stage.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Article rows */}
          <div className="bg-background max-h-[320px] overflow-y-auto">
            {stageArticles.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-[12px] text-dim font-mono">
                {totalForSource === 0 ? "No articles. Click Ingest to fetch." : "No articles in this stage."}
              </div>
            ) : (
              stageArticles.map((article) => (
                <ArticleRow key={article.id} article={article} onRefresh={onRefresh} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ArticleRow({ article, onRefresh }: { article: ArticleData; onRefresh: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const stageDef = STAGE_DEFS.find(s => s.id === article.stage);
  const isFailed = article.stage === "failed";

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    fetch(`/api/article-pipeline/${article.id}/retry`, { method: "POST", credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success("Article queued for retry"); onRefresh(); })
      .catch(() => toast.error("Retry failed"))
      .finally(() => setRetrying(false));
  };

  return (
    <div className="px-5 py-2.5 border-t border-border hover:bg-surface/50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Stage pill */}
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium ${stageDef?.bg || "bg-elevated"} ${stageDef?.color || "text-dim"}`}>
            {stageDef?.label || article.stage}
          </span>
          {/* Status indicator */}
          {article.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
          )}
          {isFailed && article.error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px] text-[11px]">{article.error}</TooltipContent>
            </Tooltip>
          )}
          {/* Title */}
          <span className="text-[12px] text-foreground truncate" dir="auto">
            {article.title || "(no title)"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {article.relevanceScore != null && (
            <span className="text-[9px] font-mono text-dim">rel: {article.relevanceScore.toFixed(1)}</span>
          )}
          {article.rankScore != null && (
            <span className="text-[9px] font-mono text-success">rank: {article.rankScore.toFixed(1)}</span>
          )}
          {article.retries > 0 && (
            <span className="text-[9px] font-mono text-dim flex items-center gap-0.5">
              <RotateCw className="w-2.5 h-2.5" />{article.retries}
            </span>
          )}
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-dim hover:text-sensor transition-colors">
            <ExternalLink className="w-3 h-3" />
          </a>
          {isFailed && (
            <button onClick={handleRetry} disabled={retrying}
              className="text-[10px] text-dim font-mono hover:text-sensor transition-colors disabled:opacity-50">
              {retrying ? "…" : "Retry"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
