import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useRef } from "react";
import { X, ExternalLink, Loader2, Plus, Trash2, Power, TestTube2, Pencil, ChevronDown, ChevronRight, CheckCircle2, XCircle, SkipForward, Package, Rss, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ── Component ──────────────────────────────────────────────────────────────

export default function Source() {
  const { projectId } = useParams();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-12 flex items-center justify-between px-6 border-b border-[#151619] shrink-0 max-lg:px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Source</h1>
          <span className="text-[11px] text-dim font-mono">Configure article sources for story discovery</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 max-lg:px-4 space-y-5 pb-8">
          {/* ── Article Sources (Brain v3) ────────────────────────────── */}
          <ArticleSourcesSection projectId={projectId!} />

        </div>
      </div>
    </div>
  );
}

// ── Types for Article Sources ───────────────────────────────────────────

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
  articleCount: number;
  stats: Record<string, number>;
  hasApiKey?: boolean;
  apifyRuns?: ApifyRunData[];
  createdAt?: string;
  lastImportedRunId?: string | null;
  fetchLog?: { time: string; raw: number; gated: number; dupes: number; inserted: number; error: string | null; ms: number; runsProcessed?: number }[];
}

const SOURCE_TYPES = [
  { value: "rss",         label: "RSS Feed",             format: "url",      configFields: [{ key: "url", label: "Feed URL", placeholder: 'https://aljazeera.net/feed/crime' }] },
  { value: "apify_actor", label: "Apify Actor",          format: "apify",    configFields: [
    { key: "actorId", label: "Actor ID", placeholder: "username/actor-name" },
    { key: "datasetId", label: "Dataset ID (optional)", placeholder: "Optional fixed dataset ID", optional: true },
    { key: "limit", label: "Max items per run (0 = all)", placeholder: "0 (imports entire run)", optional: true },
  ] },
] as const;

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

function ArticleSourcesSection({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<ArticleSourceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<ArticleSourceData | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ url: string; title: string }[] | null>(null);

  const fetchSources = useCallback(() => {
    fetch(`/api/article-sources?projectId=${projectId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  }, [projectId]);

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

  const handleDelete = (id: string, label: string) => {
    if (!confirm(`Delete "${label}" and all its articles?`)) return;
    fetch(`/api/article-sources/${id}`, { method: "DELETE", credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success("Source deleted"); fetchSources(); })
      .catch(() => toast.error("Failed to delete"));
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
    <div className="rounded-xl bg-background p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-1">ARTICLE SOURCES</div>
          <p className="text-[12px] text-dim">Configure RSS feeds or Apify actors for the article pipeline. Each run is imported in full.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-dim font-mono">{totalArticles} articles · {activeCount}/{sources.length} active</span>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue text-blue-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" /> Add Source
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-dim" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-dim font-mono">
          No article sources configured. Add one to start the Brain v3 pipeline.
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              testingId={testingId}
              onTest={handleTest}
              onEdit={() => setEditSource(s)}
              onToggle={() => handleToggle(s.id, s.isActive)}
              onDelete={() => handleDelete(s.id, s.label)}
            />
          ))}
        </div>
      )}

      {/* Test results panel */}
      {testResults && (
        <div className="mt-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-dim">TEST RESULTS ({testResults.length} articles)</span>
            <button onClick={() => setTestResults(null)} className="text-dim hover:text-sensor"><X className="w-3.5 h-3.5" /></button>
          </div>
          {testResults.length === 0 ? (
            <p className="text-[12px] text-dim">No articles returned. Check your query/config.</p>
          ) : (
            <div className="space-y-1.5">
              {testResults.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="text-dim font-mono shrink-0">{i + 1}.</span>
                  <span className="text-foreground truncate flex-1">{a.title || "(no title)"}</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue shrink-0"><ExternalLink className="w-3 h-3" /></a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AddSourceDialog projectId={projectId} open={addOpen} onClose={() => setAddOpen(false)} onCreated={fetchSources} />

      {editSource && (
        <EditSourceDialog source={editSource} open={!!editSource} onClose={() => setEditSource(null)} onUpdated={fetchSources} />
      )}
    </div>
  );
}

// ── Source Logos ───────────────────────────────────────────────────────────

function ApifyLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.473 4.637L17.089 2.03a2.607 2.607 0 00-2.178 0L9.527 4.637a2.607 2.607 0 00-1.478 2.35v9.006l-4.571-2.212A2.607 2.607 0 012 11.43V5.906a.652.652 0 01.937-.585l2.173 1.052V4.637A2.607 2.607 0 016.588 2.29L11.97.03a2.607 2.607 0 012.06 0l5.383 2.26a2.607 2.607 0 011.478 2.35v5.523a.652.652 0 01-.937.585l-2.173-1.052v1.737l4.571 2.212A2.607 2.607 0 0123.83 16v5.637a.652.652 0 01-.937.585l-2.173-1.052v1.737l4.571 2.212A2.607 2.607 0 0126.77 27.47v-5.524a.652.652 0 01.937-.585l2.173 1.052V20.67a2.607 2.607 0 00-1.478-2.35l-5.384-2.607a2.607 2.607 0 00-2.178 0l-5.384 2.607a2.607 2.607 0 00-1.478 2.35v9.006l-4.571-2.212a2.607 2.607 0 01-1.478-2.35v-5.524a.652.652 0 01.937-.585l2.173 1.052v-1.737l-4.571-2.212A2.607 2.607 0 014.99 14.508V8.984a.652.652 0 01.937-.585l2.173 1.052V7.714" fill="currentColor" fillOpacity="0.9"/>
    </svg>
  );
}

function SourceLogo({ type, image }: { type: string; image?: string | null }) {
  if (image) {
    return (
      <img src={image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
    );
  }
  if (type === "rss") {
    return (
      <div className="w-8 h-8 rounded-lg bg-orange/15 flex items-center justify-center shrink-0">
        <Rss className="w-4 h-4 text-orange" />
      </div>
    );
  }
  if (type === "apify_actor") {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#00d68a]/15 flex items-center justify-center shrink-0">
        <ApifyLogo className="w-4 h-4 text-[#00d68a]" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center shrink-0">
      <Package className="w-4 h-4 text-dim" />
    </div>
  );
}

// ── Source Card ────────────────────────────────────────────────────────────

const RUN_STATUS_ICON: Record<string, React.ReactNode> = {
  imported: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  failed: <XCircle className="w-3 h-3 text-destructive" />,
  skipped_empty: <SkipForward className="w-3 h-3 text-dim" />,
};

function SourceCard({
  source: s,
  testingId,
  onTest,
  onEdit,
  onToggle,
  onDelete,
}: {
  source: ArticleSourceData;
  testingId: string | null;
  onTest: (id: string) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [runsOpen, setRunsOpen] = useState(false);
  const typeDef = SOURCE_TYPES.find(t => t.value === s.type);
  const lang = LANG_OPTIONS.find(l => l.value === s.language);
  const runs = s.apifyRuns || [];
  const importedRuns = runs.filter(r => r.status === "imported");
  const totalItemsImported = importedRuns.reduce((sum, r) => sum + (r.itemCount || 0), 0);
  const limitValue = (s.config as Record<string, unknown>).limit;
  const isLimited = typeof limitValue === "number" && limitValue > 0;

  return (
    <div className={`rounded-xl border transition-colors ${s.isActive ? "border-blue/30 bg-blue/[0.02]" : "border-border opacity-60"}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <SourceLogo type={s.type} image={s.image} />
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${s.isActive ? "bg-blue" : "bg-zinc-600"}`} />
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{typeDef?.label || s.type}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{lang?.label || s.language}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => onTest(s.id)} disabled={testingId === s.id}
              className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-sensor hover:bg-elevated/60 transition-colors disabled:opacity-50" title="Test fetch">
              {testingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onEdit}
              className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-sensor hover:bg-elevated/60 transition-colors" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onToggle}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${s.isActive ? "text-blue hover:bg-blue/10" : "text-dim hover:bg-elevated/60"}`} title={s.isActive ? "Pause" : "Activate"}>
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-full flex items-center justify-center text-dim hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="text-[11px] font-mono text-dim mb-2">
          {Object.entries(s.config as Record<string, unknown>)
            .filter(([k]) => k !== "limit" || (typeof (s.config as Record<string, unknown>).limit === "number" && (s.config as Record<string, unknown>).limit! > 0))
            .map(([k, v]) => (
              <span key={k} className="mr-3">{k}: <span className="text-foreground">{String(v)}</span></span>
            ))}
          {isLimited && (
            <span className="mr-3 text-orange">limit: <span className="text-orange">{String(limitValue)}</span> (capped)</span>
          )}
        </div>

        {s.type === "apify_actor" && (
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${s.hasApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              {s.hasApiKey ? "API token saved" : "API token missing"}
            </span>
            {runs.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-blue/10 text-blue">
                {importedRuns.length} run{importedRuns.length !== 1 ? "s" : ""} imported · {totalItemsImported.toLocaleString()} items total
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-[10px] font-mono">
          {Object.entries(s.stats || {}).map(([stage, count]) => (
            <span key={stage} className={`px-2 py-0.5 rounded-full ${stage === "failed" ? "bg-destructive/10 text-destructive" : "bg-elevated text-dim"}`}>
              {stage}: {count}
            </span>
          ))}
          {Object.keys(s.stats || {}).length === 0 && <span className="text-dim">No articles yet</span>}
          {s.lastPolledAt && <span className="text-dim ml-auto">Last poll: {new Date(s.lastPolledAt).toLocaleString()}</span>}
        </div>
      </div>

      {/* Expandable Apify Runs */}
      {s.type === "apify_actor" && runs.length > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setRunsOpen(!runsOpen)}
            className="w-full px-4 py-2 flex items-center gap-2 text-[11px] font-mono text-dim hover:text-sensor transition-colors"
          >
            {runsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Package className="w-3 h-3" />
            Apify Runs ({runs.length})
          </button>
          {runsOpen && (
            <div className="px-4 pb-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="bg-elevated/50 text-dim">
                      <th className="px-3 py-1.5 text-left font-medium">Status</th>
                      <th className="px-3 py-1.5 text-left font-medium">Run ID</th>
                      <th className="px-3 py-1.5 text-right font-medium">Items</th>
                      <th className="px-3 py-1.5 text-right font-medium">Run Date</th>
                      <th className="px-3 py-1.5 text-right font-medium">Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-t border-border/30 hover:bg-elevated/20">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            {RUN_STATUS_ICON[run.status] || <span className="w-3 h-3 rounded-full bg-dim/30" />}
                            <span className={run.status === "imported" ? "text-emerald-400" : run.status === "failed" ? "text-destructive" : "text-dim"}>
                              {run.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-foreground">
                          <a
                            href={`https://console.apify.com/storage/datasets/${run.datasetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue transition-colors inline-flex items-center gap-1"
                          >
                            {run.runId.slice(0, 12)}…
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                        <td className="px-3 py-1.5 text-right text-foreground">
                          {run.itemCount != null ? run.itemCount.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-dim">
                          {run.startedAt ? new Date(run.startedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-dim">
                          {run.importedAt ? new Date(run.importedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Source Dialog ──────────────────────────────────────────────────────

function AddSourceDialog({ projectId, open, onClose, onCreated }: { projectId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState("rss");
  const [label, setLabel] = useState("");
  const [language, setLanguage] = useState("en");
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
    if (typeDef.format === "category") return { category: config.category || typeDef.categories?.[0] || "general" };
    if (typeDef.format === "section") return { section: config.section || (typeDef as any).sections?.[0] || "world" };
    if (typeDef.format === "apify") {
      const limit = parseInt(config.limit || "0", 10);
      return {
        actorId: config.actorId || "",
        ...(config.datasetId ? { datasetId: config.datasetId } : {}),
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      };
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
      body: JSON.stringify({ projectId, type, config: buildConfig(), ...(type === "apify_actor" ? { apiKey } : {}) }),
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
      body: JSON.stringify({ projectId, type, label: finalLabel, config: buildConfig(), language, image, ...(type === "apify_actor" ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source created"); onCreated(); onClose(); setLabel(""); setConfig({}); setApiKey(""); setImage(null); setTestResults(null); })
      .catch((e) => toast.error(e?.error || "Failed to create"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] bg-background border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add Article Source</DialogTitle>
          <DialogDescription className="text-[12px] text-dim">Configure an RSS feed or Apify actor source.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Type selector */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Source Type</label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.map(t => (
                <button key={t.value} onClick={() => handleTypeChange(t.value)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-colors border ${type === t.value ? "bg-blue/10 text-blue border-blue/30" : "bg-elevated/50 text-dim border-border hover:text-sensor hover:border-border"}`}>
                  <SourceLogo type={t.value} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Label + Image */}
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Label</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder={`${typeDef.label} — Crime`}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40" />
            </div>
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Image</label>
              <input type="file" accept="image/*" ref={imageRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {image ? (
                <div className="relative w-10 h-10">
                  <img src={image} alt="" className="w-10 h-10 rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => { setImage(null); if (imageRef.current) imageRef.current.value = ""; }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => imageRef.current?.click()} className="w-10 h-10 rounded-lg border border-dashed border-border bg-surface flex items-center justify-center text-dim hover:text-sensor hover:border-foreground/20 transition-colors">
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Content Language</label>
            <div className="flex gap-1.5">
              {LANG_OPTIONS.map(l => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${language === l.value ? "bg-blue text-blue-foreground" : "bg-elevated text-dim hover:text-sensor"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Config fields — varies by type */}
          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Configuration</label>
            {typeDef.format === "category" && (
              <select value={config.category || ""} onChange={(e) => setConfig({ category: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                <option value="">Select category...</option>
                {typeDef.categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {typeDef.format === "section" && (
              <select value={config.section || ""} onChange={(e) => setConfig({ section: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                <option value="">Select section...</option>
                {(typeDef as any).sections?.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {(typeDef.format === "query" || typeDef.format === "lucene" || typeDef.format === "url" || typeDef.format === "apify") && (
              <div className="space-y-2">
                {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean; maxLen?: number }) => (
                  <div key={f.key}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[10px] text-dim font-mono">{f.label}</span>
                      {f.optional && <span className="text-[9px] text-dim">(optional)</span>}
                      {f.maxLen && <span className="text-[9px] text-dim ml-auto">{(config[f.key] || "").length}/{f.maxLen}</span>}
                    </div>
                    <input type="text" value={config[f.key] || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40" />
                    {type === "apify_actor" && f.key === "actorId" && (
                      <p className="mt-1 text-[10px] text-dim">All Apify actors should return the standard Falak dataset fields: `url`, `title`, `description`, `content`, `publishedAt`, `language`.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {typeDef.format === "apify" && (
              <div className="mt-3">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-dim font-mono">Actor API Token</span>
                  <span className="text-[9px] text-destructive">*</span>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Apify token for this actor"
                  className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                />
                <p className="mt-1 text-[10px] text-dim">Saved on this source only, so each actor can use a different Apify account/token.</p>
              </div>
            )}
          </div>

          {/* Test results */}
          {testResults && (
            <div className="rounded-xl border border-border p-3 max-h-[150px] overflow-y-auto">
              <span className="text-[10px] font-mono text-dim mb-1.5 block">TEST: {testResults.length} articles</span>
              {testResults.length === 0 ? (
                <p className="text-[11px] text-dim">No results. Check your config.</p>
              ) : testResults.map((a, i) => (
                <div key={i} className="text-[11px] text-foreground truncate py-0.5">{i + 1}. {a.title || a.url}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
          <button onClick={handleTest} disabled={testing}
            className="px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <TestTube2 className="w-3.5 h-3.5 inline mr-1" />}
            Test
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Create Source
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Source Dialog ─────────────────────────────────────────────────────

function EditSourceDialog({ source, open, onClose, onUpdated }: { source: ArticleSourceData; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [label, setLabel] = useState(source.label);
  const [language, setLanguage] = useState(source.language);
  const [config, setConfig] = useState<Record<string, string>>(source.config as Record<string, string>);
  const [apiKey, setApiKey] = useState("");
  const [image, setImage] = useState<string | null>(source.image);
  const [saving, setSaving] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);

  const typeDef = SOURCE_TYPES.find(t => t.value === source.type)!;

  useEffect(() => {
    setLabel(source.label);
    setLanguage(source.language);
    setConfig(source.config as Record<string, string>);
    setApiKey("");
    setImage(source.image);
  }, [source]);

  const buildConfig = () => {
    if (typeDef.format === "category") return { category: config.category || "general" };
    if (typeDef.format === "section") return { section: config.section || "world" };
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
      body: JSON.stringify({ label: label.trim(), language, config: buildConfig(), image, ...(typeDef.format === "apify" && apiKey ? { apiKey } : {}) }),
    })
      .then((r) => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(() => { toast.success("Source updated"); onUpdated(); onClose(); })
      .catch((e) => toast.error(e?.error || "Failed to update"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] bg-background border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit Source: {source.label}</DialogTitle>
          <DialogDescription className="text-[12px] text-dim">Update source configuration. Type cannot be changed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-dim font-mono">{typeDef?.label || source.type}</span>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Label</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground placeholder:text-dim focus:outline-none focus:border-blue/40" />
            </div>
            <div>
              <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Image</label>
              <input type="file" accept="image/*" ref={editImageRef} className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              {image ? (
                <div className="relative w-10 h-10">
                  <img src={image} alt="" className="w-10 h-10 rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => { setImage(null); if (editImageRef.current) editImageRef.current.value = ""; }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => editImageRef.current?.click()} className="w-10 h-10 rounded-lg border border-dashed border-border bg-surface flex items-center justify-center text-dim hover:text-sensor hover:border-foreground/20 transition-colors">
                  <ImagePlus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Content Language</label>
            <div className="flex gap-1.5">
              {LANG_OPTIONS.map(l => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${language === l.value ? "bg-blue text-blue-foreground" : "bg-elevated text-dim hover:text-sensor"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-dim font-mono uppercase tracking-wider mb-1.5 block">Configuration</label>
            {typeDef.format === "category" && (
              <select value={config.category as string || ""} onChange={(e) => setConfig({ category: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                {typeDef.categories?.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {typeDef.format === "section" && (
              <select value={config.section as string || ""} onChange={(e) => setConfig({ section: e.target.value })}
                className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:border-blue/40">
                {(typeDef as any).sections?.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {(typeDef.format === "query" || typeDef.format === "lucene" || typeDef.format === "url" || typeDef.format === "apify") && (
              <div className="space-y-2">
                {(typeDef as any).configFields?.map((f: { key: string; label: string; placeholder: string; optional?: boolean }) => (
                  <div key={f.key}>
                    <span className="text-[10px] text-dim font-mono mb-1 block">{f.label}</span>
                    <input type="text" value={(config[f.key] as string) || ""} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40" />
                  </div>
                ))}
              </div>
            )}
            {typeDef.format === "apify" && (
              <div className="mt-3">
                <span className={`inline-flex mb-2 text-[10px] px-2 py-0.5 rounded-full font-mono ${source.hasApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {source.hasApiKey ? "Actor API token saved" : "Actor API token missing"}
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={source.hasApiKey ? "Leave blank to keep current token" : "Paste actor API token"}
                  className="w-full px-3 py-2.5 text-[13px] bg-surface border border-border rounded-xl text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-blue/40"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full border border-border text-dim hover:text-sensor transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 text-[13px] font-medium rounded-full bg-blue text-blue-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
            Save Changes
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
