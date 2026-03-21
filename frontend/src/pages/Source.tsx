import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { X, ExternalLink, Loader2, Plus, Trash2, Power, TestTube2, Pencil, CheckCircle2, XCircle, SkipForward, Clock, Package, Rss, ImagePlus, Download, RefreshCw, Search, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";

// ── Component ──────────────────────────────────────────────────────────────

export default function Source() {
  const { channelId } = useParams();

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">
        <ArticleSourcesSection channelId={channelId!} />
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ApifyRunData {
  id: string;
  runId: string;
  datasetId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  itemCount: number | null;
  status: string;
  importedAt: string | null;
}

interface ArticleSourceData {
  id: string;
  type: string;
  label: string;
  image: string | null;
  config: Record<string, unknown>;
  language: string;
  isActive: boolean;
  lastPolledAt: string | null;
  nextCheckAt: string | null;
  articleCount: number;
  stats: Record<string, number>;
  hasApiKey?: boolean;
  apifyRuns?: ApifyRunData[];
  createdAt?: string;
  lastImportedRunId?: string | null;
  fetchLog?: { time: string; raw: number; gated: number; dupes: number; inserted: number; error: string | null; ms: number; runsProcessed?: number }[];
}

const SOURCE_TYPES = [
  { value: "rss",         label: "RSS Feed",        format: "url",     configFields: [{ key: "url", label: "Feed URL", placeholder: "https://aljazeera.net/feed/crime" }] },
  { value: "apify_actor", label: "Apify Actor",      format: "apify",   configFields: [
    { key: "actorId", label: "Actor ID", placeholder: "username/actor-name" },
    { key: "datasetId", label: "Dataset ID (optional)", placeholder: "Optional fixed dataset ID", optional: true },
    { key: "limit", label: "Max items per run (0 = all)", placeholder: "0 (imports entire run)", optional: true },
  ] },
  { value: "youtube_channel", label: "YouTube Channel", format: "youtube", configFields: [
    { key: "channelUrl", label: "Channel URL or @handle", placeholder: "https://youtube.com/@ChannelName or @ChannelName" },
  ] },
] as const;

// ── Main section ──────────────────────────────────────────────────────────

function ArticleSourcesSection({ channelId }: { channelId: string }) {
  const [sources, setSources] = useState<ArticleSourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<ArticleSourceData | null>(null);
  const [deleteSource, setDeleteSource] = useState<{ id: string; label: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ url: string; title: string }[] | null>(null);

  const fetchSources = useCallback(() => {
    fetch(`/api/article-sources?channelId=${channelId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleToggle = (id: string, isActive: boolean) => {
    fetch(`/api/article-sources/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success(isActive ? "Source paused" : "Source activated"); fetchSources(); })
      .catch(() => toast.error("Failed to update"));
  };

  const handleDelete = (id: string) => {
    fetch(`/api/article-sources/${id}`, { method: "DELETE", credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success("Source deleted"); setDeleteSource(null); fetchSources(); })
      .catch(() => toast.error("Failed to delete"));
  };

  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const handleFetchNew = (id: string) => {
    setFetchingId(id);
    fetch("/api/article-pipeline/ingest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, sourceId: id }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => {
        const r = d.results?.[0];
        toast.success(`Fetched ${r?.fetched ?? 0} articles, ${r?.inserted ?? 0} new`);
        fetchSources();
      })
      .catch((e) => toast.error(e?.error || "Fetch failed"))
      .finally(() => setFetchingId(null));
  };

  const handleTest = (id: string) => {
    setTestingId(id);
    setTestResults(null);
    fetch(`/api/article-sources/${id}/test`, { method: "POST", credentials: "include" })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => { setTestResults(d.articles || []); toast.success(`${d.count} articles found`); })
      .catch((e) => { toast.error(e?.error || "Test failed"); setTestResults(null); })
      .finally(() => setTestingId(null));
  };

  const totalArticles = sources.reduce((sum, s) => sum + (s.articleCount || 0), 0);
  const activeCount = sources.filter(s => s.isActive).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-[20px] font-semibold tabular-nums">{totalArticles.toLocaleString()}</span>
            <span className="text-[12px] text-muted-foreground">articles across {sources.length} source{sources.length !== 1 ? "s" : ""}</span>
          </div>
          {sources.length > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {activeCount} active
            </span>
          )}
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Add Source
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState icon={Package} title="No sources yet" description="Add an RSS feed or Apify actor to get started." />
      ) : (
        <div className="space-y-4">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              testingId={testingId}
              fetchingId={fetchingId}
              onTest={handleTest}
              onFetchNew={handleFetchNew}
              onEdit={() => setEditSource(s)}
              onToggle={() => handleToggle(s.id, s.isActive)}
              onDelete={() => setDeleteSource({ id: s.id, label: s.label })}
              onRefresh={fetchSources}
            />
          ))}
        </div>
      )}

      {testResults && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium">Test Results <span className="text-muted-foreground font-mono ml-1">{testResults.length} articles</span></span>
            <button onClick={() => setTestResults(null)} className="text-muted-foreground hover:text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
          {testResults.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No articles returned.</p>
          ) : (
            <div className="space-y-1">
              {testResults.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] py-1 px-2 rounded-lg hover:bg-card/40">
                  <span className="text-muted-foreground font-mono w-5 text-right shrink-0">{i + 1}</span>
                  <span className="text-foreground truncate flex-1">{a.title || "(no title)"}</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0"><ExternalLink className="w-3 h-3" /></a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AddSourceDialog channelId={channelId} open={addOpen} onClose={() => setAddOpen(false)} onCreated={fetchSources} />
      {editSource && (
        <EditSourceDialog source={editSource} open={!!editSource} onClose={() => setEditSource(null)} onUpdated={fetchSources} />
      )}

      <AlertDialog open={!!deleteSource} onOpenChange={(v) => { if (!v) setDeleteSource(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the source and all its articles. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSource && handleDelete(deleteSource.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Source Logo ────────────────────────────────────────────────────────────

function ApifyLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.473 4.637L17.089 2.03a2.607 2.607 0 00-2.178 0L9.527 4.637a2.607 2.607 0 00-1.478 2.35v9.006l-4.571-2.212A2.607 2.607 0 012 11.43V5.906a.652.652 0 01.937-.585l2.173 1.052V4.637A2.607 2.607 0 016.588 2.29L11.97.03a2.607 2.607 0 012.06 0l5.383 2.26a2.607 2.607 0 011.478 2.35v5.523a.652.652 0 01-.937.585l-2.173-1.052v1.737l4.571 2.212A2.607 2.607 0 0123.83 16v5.637a.652.652 0 01-.937.585l-2.173-1.052v1.737l4.571 2.212A2.607 2.607 0 0126.77 27.47v-5.524a.652.652 0 01.937-.585l2.173 1.052V20.67a2.607 2.607 0 00-1.478-2.35l-5.384-2.607a2.607 2.607 0 00-2.178 0l-5.384 2.607a2.607 2.607 0 00-1.478 2.35v9.006l-4.571-2.212a2.607 2.607 0 01-1.478-2.35v-5.524a.652.652 0 01.937-.585l2.173 1.052v-1.737l-4.571-2.212A2.607 2.607 0 014.99 14.508V8.984a.652.652 0 01.937-.585l2.173 1.052V7.714" fill="currentColor" fillOpacity="0.9"/>
    </svg>
  );
}

function SourceLogo({ type, image, config, size = "md" }: { type: string; image?: string | null; config?: Record<string, unknown>; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const iconDim = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  const displayImage = image || (config?.avatarUrl as string) || null;
  if (displayImage) {
    return <img src={displayImage} alt="" className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  if (type === "rss") {
    return (
      <div className={`${dim} rounded-full bg-orange/15 flex items-center justify-center shrink-0`}>
        <Rss className={`${iconDim} text-orange`} />
      </div>
    );
  }
  if (type === "apify_actor") {
    return (
      <div className={`${dim} rounded-full bg-[#00d68a]/15 flex items-center justify-center shrink-0`}>
        <ApifyLogo className={`${iconDim} text-[#00d68a]`} />
      </div>
    );
  }
  if (type === "youtube_channel") {
    return (
      <div className={`${dim} rounded-full bg-red-500/15 flex items-center justify-center shrink-0`}>
        <Youtube className={`${iconDim} text-red-500`} />
      </div>
    );
  }
  return (
    <div className={`${dim} rounded-full bg-card flex items-center justify-center shrink-0`}>
      <Package className={`${iconDim} text-muted-foreground`} />
    </div>
  );
}

// ── Run status helpers ────────────────────────────────────────────────────

const RUN_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  imported:      { icon: <CheckCircle2 className="w-3 h-3" />, color: "text-emerald-400", bg: "bg-emerald-400/10", label: "Imported" },
  failed:        { icon: <XCircle className="w-3 h-3" />,      color: "text-red-400",     bg: "bg-red-400/10",     label: "Failed" },
  skipped_empty: { icon: <SkipForward className="w-3 h-3" />,  color: "text-zinc-500",    bg: "bg-zinc-500/10",    label: "Skipped" },
  pending:       { icon: <Clock className="w-3 h-3" />,        color: "text-amber-400",   bg: "bg-amber-400/10",   label: "Pending" },
};

function RunStatusBadge({ status }: { status: string }) {
  const cfg = RUN_STATUS_CONFIG[status] || { icon: <Clock className="w-3 h-3" />, color: "text-zinc-500", bg: "bg-zinc-500/10", label: status };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function RunRow({ run, sourceId, onRefresh }: { run: { id: string; runId: string; datasetId: string | null; itemCount: number | null; startedAt: string | null; status: string; importedAt: string | null }; sourceId: string; onRefresh: () => void }) {
  const [fetching, setFetching] = useState(false);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<{ fetched: number; inserted: number; dupes: number; runDupes?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canFetch = !!run.datasetId;

  const handleFetch = () => {
    setFetching(true);
    setResult(null);
    setError(null);
    setPhase("Fetching items from Apify…");

    const start = Date.now();
    fetch(`/api/article-sources/${sourceId}/reimport-run`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run.runId }),
    })
      .then((r) => {
        setPhase("Checking DB for duplicates…");
        return r.ok ? r.json() : r.json().then(d => Promise.reject(d));
      })
      .then((d: { fetched: number; inserted: number; dupes: number; runDupes?: number }) => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        setPhase(`Done in ${elapsed}s`);
        setResult(d);
        onRefresh();
      })
      .catch((e) => {
        setPhase("");
        setError(e?.error || "Re-import failed");
        toast.error(e?.error || "Re-import failed");
      })
      .finally(() => setFetching(false));
  };

  const clearResult = () => { setResult(null); setPhase(""); setError(null); };

  return (
    <div className="border-b border-border/20 last:border-0">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-3 py-2 text-[11px] hover:bg-card/20 transition-colors">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={`https://console.apify.com/storage/datasets/${run.datasetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-foreground hover:text-primary transition-colors truncate inline-flex items-center gap-1"
          >
            {run.runId.slice(0, 16)}
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-40" />
          </a>
        </div>
        <span className="text-right font-mono text-foreground tabular-nums">
          {run.itemCount != null ? run.itemCount.toLocaleString() : "—"}
        </span>
        <span className="text-right text-muted-foreground font-mono tabular-nums">
          {run.startedAt ? timeAgo(run.startedAt) : "—"}
        </span>
        <div className="text-right">
          <RunStatusBadge status={run.status} />
        </div>
        <div className="w-7 flex items-center justify-center">
          {canFetch ? (
            <button onClick={handleFetch} disabled={fetching} title="Re-import this run"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
              {fetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            </button>
          ) : null}
        </div>
      </div>

      {(fetching || result || error) && (
        <div className="px-3 pb-2 -mt-0.5">
          <div className={`rounded-lg px-3 py-2 text-[11px] font-mono ${error ? "bg-destructive/5 border border-destructive/20" : result ? "bg-success/5 border border-success/20" : "bg-primary/5 border border-primary/20"}`}>
            {fetching && (
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>{phase}</span>
              </div>
            )}
            {error && !fetching && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-red-400">{error}</span>
                <button onClick={clearResult} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
            )}
            {result && !fetching && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="text-foreground">{phase}</span>
                  <span className="text-emerald-400">{result.inserted} new</span>
                  {result.dupes > 0 && <span>{result.dupes} already in DB</span>}
                  {(result.runDupes ?? 0) > 0 && <span>{result.runDupes} dupes in run</span>}
                  <span>of {result.fetched} fetched</span>
                </div>
                <button onClick={clearResult} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Source Card ────────────────────────────────────────────────────────────

function SourceCard({
  source: s,
  testingId,
  fetchingId,
  onTest,
  onFetchNew,
  onEdit,
  onToggle,
  onDelete,
  onRefresh,
}: {
  source: ArticleSourceData;
  testingId: string | null;
  fetchingId: string | null;
  onTest: (id: string) => void;
  onFetchNew: (id: string) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const runs = s.apifyRuns || [];

  const { imported, failed, pending, totalItems, importedItems } = useMemo(() => {
    let imp = 0, fail = 0, pend = 0, totalIt = 0, impIt = 0;
    for (const r of runs) {
      const items = r.itemCount || 0;
      totalIt += items;
      if (r.status === "imported") { imp++; impIt += items; }
      else if (r.status === "failed") fail++;
      else pend++;
    }
    return { imported: imp, failed: fail, pending: pend, totalItems: totalIt, importedItems: impIt };
  }, [runs]);

  const progressPct = runs.length > 0 ? Math.round((imported / runs.length) * 100) : 0;

  return (
    <div className={`rounded-lg border transition-all ${s.isActive ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60"}`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SourceLogo type={s.type} image={s.image} config={s.config} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold truncate">{s.label}</span>
                {!s.isActive && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase">paused</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {(s.config as Record<string, unknown>).actorId as string || (s.config as Record<string, unknown>).url as string || s.type}
                </span>
                {s.type === "apify_actor" && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${s.hasApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {s.hasApiKey ? "token ok" : "no token"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onFetchNew(s.id)} disabled={fetchingId === s.id}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition-colors disabled:opacity-50" title="Check for new articles">
              {fetchingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onTest(s.id)} disabled={testingId === s.id}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors disabled:opacity-50" title="Test connection">
              {testingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onToggle}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${s.isActive ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-card"}`}
              title={s.isActive ? "Pause" : "Activate"}>
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
          <span><span className="text-foreground font-semibold">{s.articleCount.toLocaleString()}</span> articles</span>
          {Object.entries(s.stats || {}).map(([stage, count]) => (
            <span key={stage} className={stage === "failed" ? "text-red-400" : ""}>
              {stage} <span className="text-foreground">{count}</span>
            </span>
          ))}
          {s.lastPolledAt && <span className="ml-auto">polled {timeAgo(s.lastPolledAt)}</span>}
        </div>
      </div>

      {/* YouTube channel cadence info */}
      {s.type === "youtube_channel" && (
        <YouTubeCadenceBar source={s} />
      )}

      {/* Apify runs progress + list */}
      {s.type === "apify_actor" && runs.length > 0 && (
        <div className="border-t border-border/50">
          {/* Progress section */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground">Import progress</span>
                <span className="font-mono text-foreground font-semibold">{imported}/{runs.length} runs</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-foreground">{importedItems.toLocaleString()}<span className="text-muted-foreground">/{totalItems.toLocaleString()} items</span></span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                {imported > 0 && <span className="text-emerald-400">{imported} imported</span>}
                {failed > 0 && <span className="text-red-400">{failed} failed</span>}
                {pending > 0 && <span className="text-amber-400">{pending} pending</span>}
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-card overflow-hidden flex">
              {imported > 0 && <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${(imported / runs.length) * 100}%` }} />}
              {failed > 0 && <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${(failed / runs.length) * 100}%` }} />}
              {pending > 0 && <div className="h-full bg-amber-400/50 transition-all duration-500" style={{ width: `${(pending / runs.length) * 100}%` }} />}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-1 text-right">{progressPct}% complete</div>
          </div>

          {/* Runs list */}
          <div className="px-4 pb-3">
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-3 py-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider bg-card/30 border-b border-border/30">
                <span>Run</span>
                <span className="text-right">Items</span>
                <span className="text-right">Date</span>
                <span className="text-right">Status</span>
                <span></span>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} sourceId={s.id} onRefresh={onRefresh} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── YouTube Cadence Bar ───────────────────────────────────────────────────

type YTStatus = "active" | "regular" | "slow" | "inactive";

function deriveYTStatus(config: Record<string, unknown>): YTStatus {
  const lastVideoAt = config?.lastVideoFoundAt as string | undefined;
  if (!lastVideoAt) return "active";
  const days = (Date.now() - new Date(lastVideoAt).getTime()) / 86400000;
  if (days < 3) return "active";
  if (days < 14) return "regular";
  if (days < 30) return "slow";
  return "inactive";
}

const YT_STATUS_COLOR: Record<YTStatus, string> = {
  active: "bg-success",
  regular: "bg-primary",
  slow: "bg-orange",
  inactive: "bg-destructive",
};

const YT_STATUS_LABEL: Record<YTStatus, string> = {
  active: "Active",
  regular: "Regular",
  slow: "Slow",
  inactive: "Inactive",
};

const YT_CADENCE_LABEL: Record<YTStatus, string> = {
  active: "every 2d",
  regular: "every 5d",
  slow: "every 10d",
  inactive: "every 20d",
};

function YouTubeCadenceBar({ source: s }: { source: ArticleSourceData }) {
  const status = deriveYTStatus(s.config);
  const lastVideoAt = s.config?.lastVideoFoundAt as string | undefined;
  const handle = (s.config?.handle as string) || "";
  const subscribers = s.config?.subscribers as number | undefined;

  const doneCount = (s.stats?.done || 0);
  const filteredCount = (s.stats?.filtered || 0);
  const totalProcessed = doneCount + filteredCount;
  const passRate = totalProcessed > 0 ? Math.round((doneCount / totalProcessed) * 100) : 0;

  return (
    <div className="border-t border-border/50 px-4 py-3">
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${YT_STATUS_COLOR[status]}`} />
          <span className="text-[11px] font-medium text-foreground">{YT_STATUS_LABEL[status]}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{YT_CADENCE_LABEL[status]}</span>
        </div>
        {handle && (
          <a href={`https://youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground font-mono hover:text-foreground transition-colors">
            {handle.startsWith("@") ? handle : `@${handle}`}
          </a>
        )}
        {subscribers != null && subscribers > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {subscribers >= 1000000 ? `${(subscribers / 1000000).toFixed(1)}M` : subscribers >= 1000 ? `${(subscribers / 1000).toFixed(0)}K` : subscribers} subs
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
        {lastVideoAt && (
          <span>last video {timeAgo(lastVideoAt)}</span>
        )}
        {s.nextCheckAt && (
          <span>next check {timeAgo(s.nextCheckAt).replace(" ago", "").startsWith("-") ? "soon" : `in ${(() => {
            const diff = new Date(s.nextCheckAt).getTime() - Date.now();
            if (diff <= 0) return "soon";
            const h = Math.floor(diff / 3600000);
            const d = Math.floor(h / 24);
            if (d > 0) return `${d}d ${h % 24}h`;
            if (h > 0) return `${h}h`;
            return `${Math.floor(diff / 60000)}m`;
          })()}`}</span>
        )}
        {totalProcessed > 0 && (
          <>
            <span>pass rate <span className={passRate >= 60 ? "text-success" : passRate >= 30 ? "text-orange" : "text-destructive"}>{passRate}%</span></span>
            <span>{doneCount} passed / {totalProcessed} processed</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add Source Dialog ──────────────────────────────────────────────────────

function AddSourceDialog({ channelId, open, onClose, onCreated }: { channelId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState("rss");
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{ url: string; title: string }[] | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const typeDef = SOURCE_TYPES.find(t => t.value === type)!;

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setConfig({});
    setApiKey("");
    setTestResults(null);
  };

  const buildConfig = () => {
    if (typeDef.format === "apify") {
      const limit = parseInt(config.limit || "0", 10);
      return {
        actorId: config.actorId || "",
        ...(config.datasetId ? { datasetId: config.datasetId } : {}),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      };
    }
    if (typeDef.format === "youtube") {
      return { channelUrl: config.channelUrl || "" };
    }
    const c: Record<string, string> = {};
    for (const f of (typeDef as any).configFields || []) {
      if (config[f.key]) c[f.key] = config[f.key];
    }
    return c;
  };

  const handleTest = () => {
    setTesting(true);
    setTestResults(null);
    fetch("/api/article-sources/test-config", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, type, config: buildConfig(), ...(type === "apify_actor" ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then((d) => { setTestResults(d.articles || []); toast.success(`${d.count} articles found`); })
      .catch((e) => toast.error(e?.error || "Test failed"))
      .finally(() => setTesting(false));
  };

  const handleSave = () => {
    const finalLabel = label.trim() || typeDef.label;
    setSaving(true);
    fetch("/api/article-sources", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, type, label: finalLabel, config: buildConfig(), image, ...(type === "apify_actor" ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source created"); onCreated(); onClose(); setLabel(""); setConfig({}); setApiKey(""); setImage(null); setTestResults(null); })
      .catch((e) => toast.error(e?.error || "Failed to create"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add Source</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">Add an RSS feed or Apify actor.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-3">
          {/* Type */}
          <div className="flex gap-2">
            {SOURCE_TYPES.map(t => (
              <button key={t.value} onClick={() => handleTypeChange(t.value)}
                className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-all border ${type === t.value ? "bg-foreground/5 text-foreground border-border" : "bg-transparent text-muted-foreground border-border hover:border-border"}`}>
                <SourceLogo type={t.value} size="sm" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Label + Image */}
          <div className="flex gap-3 items-end">
            <div>
              <input type="file" accept="image/*" ref={imageRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {image ? (
                <div className="relative w-[42px] h-[42px]">
                  <img src={image} alt="" className="w-[42px] h-[42px] rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => { setImage(null); if (imageRef.current) imageRef.current.value = ""; }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => imageRef.current?.click()}
                  className="w-[42px] h-[42px] rounded-lg border border-dashed border-border bg-card/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-all">
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Name</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder={typeDef.label}
                className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border" />
            </div>
          </div>

          {/* Config */}
          <div className="space-y-2.5">
            {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean }) => (
              <div key={f.key}>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">{f.label}</label>
                  {f.optional && <span className="text-[9px] text-muted-foreground/60">optional</span>}
                </div>
                <input type="text" value={config[f.key] || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-border" />
              </div>
            ))}
            {typeDef.format === "apify" && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">API Token</label>
                  <span className="text-[9px] text-red-400">required</span>
                </div>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder="apify_api_..."
                  className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-border" />
              </div>
            )}
          </div>

          {/* Test results */}
          {testResults && (
            <div className="rounded-lg border border-border p-3 max-h-[150px] overflow-y-auto">
              <span className="text-[10px] font-mono text-muted-foreground mb-1.5 block">{testResults.length} articles found</span>
              {testResults.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No results.</p>
              ) : testResults.map((a, i) => (
                <div key={i} className="text-[11px] text-foreground truncate py-0.5">{i + 1}. {a.title || a.url}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleTest} disabled={testing}
            className="px-4 py-2.5 text-[13px] font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <TestTube2 className="w-3.5 h-3.5 inline mr-1" />}
            Test
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Create
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Source Dialog ─────────────────────────────────────────────────────

function EditSourceDialog({ source, open, onClose, onUpdated }: { source: ArticleSourceData; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [label, setLabel] = useState(source.label);
  const [config, setConfig] = useState<Record<string, string>>(source.config as Record<string, string>);
  const [apiKey, setApiKey] = useState("");
  const [image, setImage] = useState<string | null>(source.image);
  const [saving, setSaving] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);

  const typeDef = SOURCE_TYPES.find(t => t.value === source.type)!;

  useEffect(() => {
    setLabel(source.label);
    setConfig(source.config as Record<string, string>);
    setApiKey("");
    setImage(source.image);
  }, [source]);

  const buildConfig = () => {
    if (typeDef.format === "apify") {
      const limit = parseInt((config.limit as string) || "", 10);
      return {
        actorId: (config.actorId as string) || "",
        ...((config.datasetId as string) ? { datasetId: config.datasetId as string } : {}),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      };
    }
    const c: Record<string, string> = {};
    for (const f of (typeDef as any).configFields || []) {
      if (config[f.key]) c[f.key] = config[f.key];
    }
    return c;
  };

  const handleSave = () => {
    setSaving(true);
    fetch(`/api/article-sources/${source.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), config: buildConfig(), image, ...(typeDef.format === "apify" && apiKey ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source updated"); onUpdated(); onClose(); })
      .catch((e) => toast.error(e?.error || "Failed to update"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit Source</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">Update configuration for {source.label}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-3">
          {/* Label + Image */}
          <div className="flex gap-3 items-end">
            <div>
              <input type="file" accept="image/*" ref={editImageRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {image ? (
                <div className="relative w-[42px] h-[42px]">
                  <img src={image} alt="" className="w-[42px] h-[42px] rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => { setImage(null); if (editImageRef.current) editImageRef.current.value = ""; }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => editImageRef.current?.click()}
                  className="w-[42px] h-[42px] rounded-lg border border-dashed border-border bg-card/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-all">
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5 block">Name</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border" />
            </div>
          </div>

          {/* Config */}
          <div className="space-y-2.5">
            {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean }) => (
              <div key={f.key}>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">{f.label}</label>
                  {f.optional && <span className="text-[9px] text-muted-foreground/60">optional</span>}
                </div>
                <input type="text" value={(config[f.key] as string) || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-border" />
              </div>
            ))}
            {typeDef.format === "apify" && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">API Token</label>
                  <span className={`text-[9px] font-mono ${source.hasApiKey ? "text-emerald-400" : "text-red-400"}`}>
                    {source.hasApiKey ? "saved" : "missing"}
                  </span>
                </div>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={source.hasApiKey ? "Leave blank to keep current" : "apify_api_..."}
                  className="w-full px-3 py-2.5 text-[13px] bg-card border border-border rounded-lg text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-border" />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
